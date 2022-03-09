const bitkub = require('./js/bitkub')
var keys = require('./keys.local.json')
const client = new bitkub(keys.bitkub)
client.verbose = true

async function main() {
  try {
    await client.loadMarkets()
    // let outcome = await client.cancelOrder('2')

    // console.log(outcome)
    outcome = await client.createLimitBuyOrder('XRP/THB', 20, 100, {test: true})
    console.log(outcome)
  } catch(e) {
    console.log(e)
  }
}

main()

