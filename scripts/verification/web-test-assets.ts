import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/** Node unit tests do not run Next's static-image loader. Resolve the real
 * authored UI asset to a deterministic URL; browser tests still decode bytes. */
registerHooks({
  load(url,context,nextLoad){
    if(url.startsWith('file:')&&url.endsWith('.webp')&&url.replaceAll('\\','/').includes('/packages/ui/src/assets/icons/')){
      const bytes=readFileSync(fileURLToPath(url));
      if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('UI test asset is not a WebP source.');
      const source=`/__unit_asset__/${createHash('sha256').update(bytes).digest('hex')}.webp`;
      return{format:'module',source:`export default ${JSON.stringify({src:source})};`,shortCircuit:true};
    }
    return nextLoad(url,context);
  },
});
