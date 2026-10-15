import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
window.LiftNative = {
  isNative: Capacitor.isNativePlatform(),
  http: CapacitorHttp,
  async shareFile(name, text) {
    const file = await Filesystem.writeFile({path:name,data:text,directory:Directory.Cache,encoding:Encoding.UTF8});
    await Share.share({title:name,files:[file.uri]});
  },
  print: registerPlugin('LiftPrint')
};
