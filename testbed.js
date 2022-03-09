const bitkub = require('./js/bitkub')
var keys = require('./keys.local.json')
const client = new bitkub(keys.bitkub)
client.verbose = true

async function main() {
  try {
    await client.loadMarkets()
    outcome = await client.cancelOrder('2')

    console.log(outcome)
  } catch(e) {
    console.log(e)
  }
}

main()

