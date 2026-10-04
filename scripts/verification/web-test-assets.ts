import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const { imageSize } = createRequire(import.meta.url)('next/dist/compiled/image-size') as { imageSize(bytes: Buffer): { width?: number; height?: number } };

/** Node unit tests do not run Next's static-image loader. Resolve the real
 * authored UI asset to a deterministic URL; browser tests still decode bytes. */
registerHooks({
  load(url,context,nextLoad){
    const path = url.replaceAll('\\','/');
    if (url.startsWith('file:') && path.endsWith('/node_modules/next/image.js')) {
      return { format: 'module', source: `import { createRequire } from 'node:module';const value=createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(fileURLToPath(url))});export default value.default;export const getImageProps=value.getImageProps;`, shortCircuit: true };
    }
    const owned = path.includes('/packages/ui/src/assets/icons/') || path.includes('/apps/web/shared/assets/') || path.includes('/apps/web/shared/characters/assets/') || path.includes('/apps/web/features/auth/assets/');
    if(url.startsWith('file:')&&/\.(webp|png|svg)$/.test(url)&&owned){
      const bytes=readFileSync(fileURLToPath(url));
      const extension = url.split('.').at(-1);
      if(extension==='webp'&&(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'))throw new Error('UI test asset is not a WebP source.');
      const source=`/__unit_asset__/${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
      const dimensions = imageSize(bytes);
      if (!dimensions.width || !dimensions.height) throw new Error('Owned test asset has no intrinsic dimensions.');
      return{format:'module',source:`export default ${JSON.stringify({src:source,width:dimensions.width,height:dimensions.height})};`,shortCircuit:true};
    }
    return nextLoad(url,context);
  },
});
