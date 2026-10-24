import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';

export function createFilesRouter({ runAdb, defaultDownloadDir }) {
  const router = express.Router();

  function sanitizeRemotePath(p, defaultPath = '/sdcard/') {
    if (!p || typeof p !== 'string') return defaultPath;
    let clean = p.trim();
    // Path traversal prevention
    if (clean.includes('..')) {
      throw new Error('Directory traversal (..) is not permitted');
    }
    if (!clean.startsWith('/')) {
      clean = '/' + clean;
    }
    return clean;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  // 1. GET /api/files/list
  router.get('/list', async (req, res) => {
    try {
      const { serial, path: reqPath } = req.query;
      if (!serial) return res.status(400).json({ success: false, message: 'No serial provided' });

      let targetDir = '/sdcard/';
      if (reqPath) {
        targetDir = sanitizeRemotePath(reqPath, '/sdcard/');
      }
      if (!targetDir.endsWith('/')) targetDir += '/';

      const result = await runAdb(['-s', serial, 'shell', 'ls', '-la', targetDir], 8000);
      if (!result.success && !result.output) {
        return res.json({ success: true, files: [], currentPath: targetDir });
      }

      const lines = result.output.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.startsWith('total') && !l.startsWith('Error'));
      const files = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;

        const perms = parts[0];
        const isDir = perms.startsWith('d') || perms.startsWith('l');
        let name = parts.slice(7).join(' ') || parts[parts.length - 1];
        let sizeNum = parseInt(parts[4], 10) || 0;
        let date = `${parts[5]} ${parts[6]}`;

        if (name === '.' || name === '..') continue;
        if (name.includes(' -> ')) name = name.split(' -> ')[0];

        files.push({
          name,
          path: targetDir + name,
          isDir,
          size: isDir ? 'Folder' : formatBytes(sizeNum),
          sizeBytes: sizeNum,
          sizeDisplay: isDir ? '<DIR>' : formatBytes(sizeNum),
          date,
          perms
        });
      }

      files.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
      res.json({ success: true, files, currentPath: targetDir });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  // 2. POST /api/files/upload
  router.post('/upload', async (req, res) => {
    try {
      const { serial, filePath, fileName, base64Data, remoteDir = '/sdcard/Download/', isApkInstall } = req.body;
      if (!serial) return res.status(400).json({ success: false, message: 'Missing serial' });

      const targetDir = sanitizeRemotePath(remoteDir, '/sdcard/Download/');
      let localSourcePath = filePath;

      // If uploaded as base64 from browser
      if (!localSourcePath && base64Data && fileName) {
        localSourcePath = path.join(os.tmpdir(), fileName);
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(localSourcePath, buffer);
      }

      if (!localSourcePath || !fs.existsSync(localSourcePath)) {
        return res.status(400).json({ success: false, message: 'Local source file does not exist' });
      }

      const actualName = path.basename(localSourcePath);

      if (isApkInstall || actualName.toLowerCase().endsWith('.apk')) {
        const installRes = await runAdb(['-s', serial, 'install', '-r', localSourcePath], 120000);
        if (installRes.output && installRes.output.includes('Success')) {
          return res.json({ success: true, message: `APK ${actualName} installed successfully!` });
        }
        return res.json({ success: false, message: `Install failed: ${installRes.output || 'Unknown error'}` });
      }

      const pushRes = await runAdb(['-s', serial, 'push', localSourcePath, targetDir], 180000);
      if (pushRes.success || (pushRes.output && pushRes.output.includes('pushed'))) {
        return res.json({ success: true, message: `Successfully pushed ${actualName} to ${targetDir}` });
      }
      return res.json({ success: false, message: pushRes.output || 'Failed to push file' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 3. POST /api/files/pull (Download from phone to PC)
  router.post('/pull', async (req, res) => {
    try {
      const { serial, remotePath, localTargetDir } = req.body;
      if (!serial || !remotePath) {
        return res.status(400).json({ success: false, message: 'Missing serial or remotePath' });
      }

      const safeRemote = sanitizeRemotePath(remotePath);
      const destDir = localTargetDir || defaultDownloadDir || path.join(os.homedir(), 'Downloads', 'StreamFusion');
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const pullRes = await runAdb(['-s', serial, 'pull', safeRemote, destDir], 180000);
      if (pullRes.success || (pullRes.output && pullRes.output.includes('pulled'))) {
        const pulledFileName = path.basename(safeRemote);
        const downloadedFile = path.join(destDir, pulledFileName);
        return res.json({
          success: true,
          message: `Downloaded to ${downloadedFile}`,
          localPath: downloadedFile,
          folder: destDir
        });
      }
      return res.json({ success: false, message: pullRes.output || 'Failed to download file' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. POST /api/files/operation (copy, move, delete, rename, mkdir)
  router.post('/operation', async (req, res) => {
    try {
      const { serial, action, targetPath, newName, destinationPath } = req.body;
      if (!serial || !action || !targetPath) {
        return res.status(400).json({ success: false, message: 'Missing required parameters' });
      }

      const safeTarget = sanitizeRemotePath(targetPath);
      // Extra protection against deleting root
      if (['/', '/sdcard', '/sdcard/'].includes(safeTarget.trim())) {
        return res.status(403).json({ success: false, message: 'Cannot modify or delete root storage directory' });
      }

      let adbArgs = [];
      let successMsg = 'Operation completed';

      switch (action) {
        case 'delete':
          adbArgs = ['-s', serial, 'shell', 'rm', '-rf', safeTarget];
          successMsg = `Deleted ${path.basename(safeTarget)}`;
          break;

        case 'rename':
          if (!newName || newName.includes('/') || newName.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid new name' });
          }
          const parentDir = path.posix.dirname(safeTarget);
          const newPath = path.posix.join(parentDir, newName.trim());
          adbArgs = ['-s', serial, 'shell', 'mv', safeTarget, newPath];
          successMsg = `Renamed to ${newName}`;
          break;

        case 'mkdir':
          if (!newName || newName.includes('/') || newName.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid folder name' });
          }
          const dirToMake = path.posix.join(safeTarget, newName.trim());
          adbArgs = ['-s', serial, 'shell', 'mkdir', '-p', dirToMake];
          successMsg = `Created folder ${newName}`;
          break;

        case 'move':
          if (!destinationPath) return res.status(400).json({ success: false, message: 'Missing destinationPath' });
          const safeDestMove = sanitizeRemotePath(destinationPath);
          adbArgs = ['-s', serial, 'shell', 'mv', safeTarget, safeDestMove];
          successMsg = `Moved to ${safeDestMove}`;
          break;

        case 'copy':
          if (!destinationPath) return res.status(400).json({ success: false, message: 'Missing destinationPath' });
          const safeDestCopy = sanitizeRemotePath(destinationPath);
          adbArgs = ['-s', serial, 'shell', 'cp', '-r', safeTarget, safeDestCopy];
          successMsg = `Copied to ${safeDestCopy}`;
          break;

        default:
          return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
      }

      const result = await runAdb(adbArgs, 10000);
      if (result.success || !result.output) {
        res.json({ success: true, message: successMsg });
      } else {
        res.json({ success: false, message: result.output });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
}
