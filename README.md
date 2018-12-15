# Installation

## Yarn/Npm

## NPM

npm install git+ssh://git@github.com:ResistancePlatform/ledger-res-js.git --save

## Yarn

yarn add git+ssh://git@github.com:ResistancePlatform/ledger-res-js.git --save

## Examples

# Run the Example Code

You can install this and run the example (in src/index.js) by doing the following:

1. Clone this repo
2. `yarn install`
3. Plug in your ledger wallet, start the resistance app in Ledger, and make sure `resistanced` rpc is running on 18132.
4. `yarn example`

# Usage

```javascript
import Client from 'bitcoin-core'
import winston from 'winston'
import LedgerRes from 'ledger-res'

(async () => {

  try {

    const logger = winston.createLogger({
      level: 'debug',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({ format: winston.format.simple() })
      ]
    });

    let rpcClient = new Client({
      network: 'testnet',
      host: '127.0.0.1',
      port: 18132,
      username: '',
      password: '',
      logger: logger,
      timeout: 10000
    })

    if(!rpcClient.username || !rpcClient.password){
      console.log("\nError: You need to set your RPC username and password in example.js. Exiting...\n")
      process.exit()
    }

    let ledgerRes = new LedgerRes(rpcClient)
    await ledgerRes.init() //must call this to initialize connection to ledger
    console.log(await ledgerRes.getPublicKey(0))


    //send some coins
    //set coin sending parameters
    let ledgerBipIndex = 0
    let sendToAddress = 'rp5wwANPBfBaEEJCnTFGL7Nfa3Fp2cj3fq3'
    let txFee = 0.0001
    let payAmount = 1

    //sign the transaction using the ledger private key
    let signedTransaction = await ledgerRes.sendCoins(sendToAddress, ledgerBipIndex, txFee, payAmount)
    console.log(signedTransaction)

    //broadcast the transaction to the Resistance network
    let sentTransaction = await ledgerRes.sendRawTransaction(signedTransaction)

  } catch (err) {
    console.log(err)
  }
})();

```
