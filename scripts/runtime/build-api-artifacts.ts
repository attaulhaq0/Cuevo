import { buildRuntimeArtifact } from './build-artifacts';

// Verify both delivery forms of the same API in the existing technical step.
await buildRuntimeArtifact('api');
await buildRuntimeArtifact('api-vercel');
