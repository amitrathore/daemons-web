import {cp,mkdir,writeFile} from 'node:fs/promises';
const api=process.env.PUBLIC_API_URL || 'https://api.daemons.ai';
if(!/^https?:\/\/[a-z0-9.:-]+$/i.test(api)) throw new Error('PUBLIC_API_URL must be an HTTP origin');
await mkdir('dist',{recursive:true}); await cp('app','dist',{recursive:true}); await writeFile('dist/config.js',`export const API = ${JSON.stringify(api)};\n`);
console.log('Console built. Public API:',api);
