const bitkub = require('./js/bitkub')

const client = new bitkub()
client.verbose = true

async function main() {
  try {
    const outcome = await client.fetchMarkets()

    console.log(outcome)
  } catch(e) {
    console.log(e)
  }
}

main()

