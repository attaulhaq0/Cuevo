import{defineConfig}from'@playwright/test';
import{resolve}from'node:path';
import { browserVerificationMetadata } from './browser-runtime-scope';
const root=resolve(import.meta.dirname,'../..');
export default defineConfig({metadata:browserVerificationMetadata(),retries:0,forbidOnly:true,testDir:resolve(root,'tests/e2e'),timeout:30000,fullyParallel:false,workers:1,reporter:[['list'],['json',{outputFile:resolve(root,'.local/customer-readiness/browser-results.json')}],['html',{open:'never',outputFolder:resolve(root,'.local/verification/playwright-production')}]],use:{baseURL:'http://localhost:3000',trace:'off',screenshot:'only-on-failure'},projects:[{name:'production-chromium',use:{browserName:'chromium'}}],webServer:{command:'node --import tsx scripts/verification/production-runtime.ts',cwd:root,url:'http://localhost:3000',reuseExistingServer:false,timeout:30000,gracefulShutdown:{signal:'SIGTERM',timeout:10000}}});
