import{defineConfig}from'@playwright/test';
import{resolve}from'node:path';
const root=resolve(import.meta.dirname,'../..');
export default defineConfig({testDir:resolve(root,'tests/e2e'),timeout:30000,fullyParallel:false,workers:1,reporter:[['list'],['html',{open:'never',outputFolder:resolve(root,'.local/verification/playwright-production')}]],use:{baseURL:'http://localhost:3000',trace:'off',screenshot:'only-on-failure'},projects:[{name:'production-chromium',use:{browserName:'chromium'}}],webServer:{command:'node --import tsx scripts/verification/production-runtime.ts',cwd:root,url:'http://localhost:3000',reuseExistingServer:false,timeout:30000}});
