import OBSWebSocket from 'obs-websocket-js';

export class ObsManager {
  private obs = new OBSWebSocket();
  private isConnected = false;

  public async connectObs(host: string, port: number, password?: string): Promise<boolean> {
    try {
      await this.obs.connect(`ws://${host}:${port}`, password);
      this.isConnected = true;
      return true;
    } catch (e) {
      console.error('OBS Connect Error:', e);
      return false;
    }
  }

  public async injectScrcpyScene(deviceName: string): Promise<boolean> {
    if (!this.isConnected) return false;

    const sceneName = `StremFusion — ${deviceName}`;
    const inputName = 'StremFusion Mirror';

    try {
      const { scenes } = await this.obs.call('GetSceneList');
      const sceneExists = scenes.some((s: any) => s.sceneName === sceneName);

      if (!sceneExists) {
        await this.obs.call('CreateScene', { sceneName });
        await this.obs.call('CreateInput', {
          sceneName,
          inputName,
          inputKind: 'window_capture',
          inputSettings: {
            window: 'StremFusion', // Matches Scrcpy window title prefix
            capture_method: 1 // Windows Graphics Capture
          }
        });
      }

      await this.obs.call('SetCurrentProgramScene', { sceneName });
      return true;
    } catch (e) {
      console.error('OBS Inject Error:', e);
      return false;
    }
  }

  public async disconnectObs(): Promise<void> {
    await this.obs.disconnect();
    this.isConnected = false;
  }

  public getObsConnected(): boolean {
    return this.isConnected;
  }
}

export const obsManager = new ObsManager();
