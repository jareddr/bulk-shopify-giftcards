const Shopify = require('shopify-api-node')
const fs = require('fs')
const readline = require('readline')

require('dotenv').config()

const { SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_SHOP_NAME } = process.env

const inFile = process.argv[2]

if (!SHOPIFY_API_KEY || !SHOPIFY_API_PASSWORD || !SHOPIFY_SHOP_NAME) {
  console.log(`Please create a .env file in this directory and fill in the values from your private app / shopify store

SHOPIFY_SHOP_NAME=REPLACE-ME
SHOPIFY_API_KEY=REPLACE-ME
SHOPIFY_API_PASSWORD=REPLACE-ME
`)
  process.exit(1)
}

if (!inFile) {
  console.log('Usage: ')
  console.log('node bulk-shopify-giftcards.js my-data.csv\n')
  console.log(
    'Where my-data.csv is of the form:\n',
    'email <string>, amount <float>, note <string>\n\n',
    'Example:\n',
    'some-customer-email@email.com, 50.00, christmas present',
  )
  process.exit(1)
}
const runTime = new Date().getTime()
const outFile = `${inFile}-${runTime}.log`

const shopify = new Shopify({
  shopName: SHOPIFY_SHOP_NAME,
  apiKey: SHOPIFY_API_KEY,
  password: SHOPIFY_API_PASSWORD,
  autoLimit: true,
})

function parseCreditLine(line) {
  const op = line.split(',')
  const email = op[0].trim()
  const amount = parseFloat(op[1].trim())
  const note = op[2].trim()
  return { email, amount, note }
}

//take ugly codes, upper case and add a space ever 4 characters
function formatCode(code) {
  return code.toUpperCase().replace(/(.{4})/g, '$1 ')
}

async function createShopifyGiftcards(creditOperations) {
  const creditSummary = {}

  fs.writeFileSync(outFile, 'email, amount, note, giftcard_id, giftcard_code')

  for (let i = 0; i < creditOperations.length; i++) {
    const { email, amount, note } = parseCreditLine(creditOperations[i])

    console.log(`Creating gift card for ${email} amt: ${amount} note: ${note}`)
    let giftcard
    try {
      //in order to suppress the email, create the giftcard without a customer
      giftcard = await shopify.giftCard.create({
        note: note,
        initial_value: amount,
      })
    } catch (e) {
      console.log('There was an error interacting with the api', e)
    }

    if (giftcard) {
      //update summary
      creditSummary[note] = creditSummary[note]
        ? creditSummary[note] + amount
        : amount

      //log new GC to file
      fs.appendFileSync(
        outFile,
        `\n${email}, ${giftcard.initial_value}, ${giftcard.note}, ${
          giftcard.id
        }, ${formatCode(giftcard.code)}`,
      )
    } else {
      console.log(
        `Failed to create gift card for ${email} amt: ${amount} note: ${note}`,
      )
    }
  }

  return creditSummary
}

async function main() {
  const creditOperations = fs
    .readFileSync(inFile, 'utf8')
    .replace('\r', '')
    .split('\n')

  const creditSummary = {}
  const uniqueEmails = {}

  creditOperations.forEach((line) => {
    const { email, amount, note } = parseCreditLine(line)
    uniqueEmails[email] = 1
    creditSummary[note] = creditSummary[note]
      ? creditSummary[note] + amount
      : amount
  })

  console.log(
    `This script will generate [${creditOperations.length}] shopify gift cards for the following amounts:\n`,
  )
  console.table(creditSummary)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  let confirmation = false
  process.stdout.write('Type BLING to proceed:')
  for await (const line of rl) {
    if (line === 'BLING') {
      confirmation = true
      break
    }
  }

  //if the user didn't explicitly confirm, then exit
  if (!confirmation) {
    process.exit(1)
  }

  console.log('Here we go...')
  const shopifyCreditSummary = await createShopifyGiftcards(creditOperations)
  console.log('Done!')
  console.table(shopifyCreditSummary)
}

main()
