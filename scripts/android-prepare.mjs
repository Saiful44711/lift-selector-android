import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
function run(args){const r=spawnSync(args[0],args.slice(1),{stdio:'inherit'});if(r.status!==0)throw new Error('Command failed: '+args.join(' ')+'; exit='+r.status);}
try{
  try{await fs.access('android/app/build.gradle');}catch{run(['npx','cap','add','android']);}
  run(['npx','cap','sync','android']);
  const folder='android/app/src/main/java/com/liftselector/engineering';await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(folder+'/LiftPrintPlugin.java',`package com.liftselector.engineering;
import android.print.PrintManager;
import android.print.PrintDocumentAdapter;
import android.print.PrintAttributes;
import android.print.PageRange;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="LiftPrint")
public class LiftPrintPlugin extends Plugin {
 @PluginMethod public void print(PluginCall call) {
  getActivity().runOnUiThread(() -> {
   try { PrintManager manager=(PrintManager)getActivity().getSystemService(Context.PRINT_SERVICE);
    PrintDocumentAdapter original=getBridge().getWebView().createPrintDocumentAdapter("Lift report");
    PrintDocumentAdapter wrapper=new PrintDocumentAdapter(){
     @Override public void onStart(){original.onStart();}
     @Override public void onLayout(PrintAttributes oldAttributes,PrintAttributes newAttributes,CancellationSignal cancellation,LayoutResultCallback callback,Bundle extras){original.onLayout(oldAttributes,newAttributes,cancellation,callback,extras);}
     @Override public void onWrite(PageRange[] pages,ParcelFileDescriptor destination,CancellationSignal cancellation,WriteResultCallback callback){original.onWrite(pages,destination,cancellation,callback);}
     @Override public void onFinish(){original.onFinish();call.resolve();}
    };
    manager.print("Lift component report",wrapper,null);
   } catch(Exception e) {call.reject("Android print failed: "+e.getMessage());}
  });
 }
}
`);
  await fs.writeFile(folder+'/MainActivity.java',`package com.liftselector.engineering;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle savedInstanceState) { registerPlugin(LiftPrintPlugin.class); super.onCreate(savedInstanceState); }
}
`);
  await fs.chmod('android/gradlew',0o755);
  for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){const dir='android/app/src/main/res/mipmap-'+density;await fs.mkdir(dir,{recursive:true});for(const name of ['ic_launcher.png','ic_launcher_round.png'])await fs.copyFile('web/icon-512.png',dir+'/'+name);}
  await fs.rm('android/app/src/main/res/drawable/ic_launcher_foreground.xml',{force:true});
  await fs.copyFile('web/icon-512.png','android/app/src/main/res/drawable/ic_launcher_foreground.png');
  // APK source uses local assets only; no cleartext network or storage permission broadening.
  let manifest=await fs.readFile('android/app/src/main/AndroidManifest.xml','utf8');
  manifest=manifest.replace('android:allowBackup="true"','android:allowBackup="false"');
  await fs.writeFile('android/app/src/main/AndroidManifest.xml',manifest);
  let gradle=await fs.readFile('android/app/build.gradle','utf8');
  const versionCode=Number(process.env.LIFT_VERSION_CODE||10000+Number(process.env.GITHUB_RUN_NUMBER||1));
  if(!Number.isSafeInteger(versionCode)||versionCode<1||versionCode>2100000000)throw new Error('Invalid Android versionCode; set LIFT_VERSION_CODE to a positive integer below 2100000001.');
  gradle=gradle.replace(/versionCode\s+\d+/, 'versionCode '+versionCode);
  if(!gradle.includes('LIFT_STORE_FILE'))gradle+=`\n// Optional release signing. Never used for debug builds.\nandroid {\n if (System.getenv('LIFT_STORE_FILE')) {\n  signingConfigs { release { storeFile file(System.getenv('LIFT_STORE_FILE')); storePassword System.getenv('LIFT_STORE_PASSWORD'); keyAlias System.getenv('LIFT_KEY_ALIAS'); keyPassword System.getenv('LIFT_KEY_PASSWORD') } }\n  buildTypes { release { signingConfig signingConfigs.release } }\n }\n}\n`;
  await fs.writeFile('android/app/build.gradle',gradle);
  console.log('Android generated, plugins synced, print adapter registered, optional signing configured.');
}catch(err){console.error('ANDROID PREPARATION FAILED:',err.message);process.exitCode=1;}
