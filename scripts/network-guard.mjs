import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('Consumer-check network guard: unexpected live network request')};
net.connect=deny;net.createConnection=deny;tls.connect=deny;
http.request=deny;http.get=deny;https.request=deny;https.get=deny;
globalThis.fetch=deny;syncBuiltinESMExports();
