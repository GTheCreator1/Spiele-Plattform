import { PeerServer } from 'peer'

const credential = process.env.STICHRUNDE_TEST_RELAY_KEY
if (credential) {
  // Both the client's TCP endpoint and each UDP relay socket are loopback-only.
  const { createServer } = await import('turn-server')
  const relay = createServer({
    auth: { mechanism: 'long-term', realm: 'localhost', credentials: { stichrunde: credential } },
    relay: { ip: '127.0.0.1', externalIp: '127.0.0.1' },
  })
  relay.on('beforeRelay', ({ peer }, allow) => allow(peer.ip === '127.0.0.1'))
  await new Promise((resolve, reject) => {
    relay.on('listening', resolve)
    relay.on('error', reject)
    relay.listen([{ address: '127.0.0.1', port: 3479, transport: 'tcp' }])
  })
}

PeerServer({ host: '127.0.0.1', port: 8790, path: '/', allow_discovery: false })
