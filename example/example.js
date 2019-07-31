import 'babel-polyfill';
import Client from 'bitcoin-core'
import winston from 'winston'
import LedgerRes from './ledger-res'


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
      network: 'mainnet',
      host: '127.0.0.1',
      port: 18132,
      username: 'resuser',
      password: 'restest',
      logger: logger,
      timeout: 10000
    })

    let ledgerRes = new LedgerRes(rpcClient)
    //await ledgerRes.init() //must call this to initialize connection to ledger
    try{
        if(await ledgerRes.isAvailable()){
          console.log(await ledgerRes.getPublicKey(0))
        }
    }
    catch (err) {
        console.log(err)
    }

    //send some coins
    //set coin sending parameters
    let ledgerBipIndex = 0
    let sendToAddress = 'r1EmvuTZeS6LezWgsxAaPKh3HzP9EXJDPEp'
    let txFee = 0.0001
    let payAmount = 1

    //sign the transaction using the ledger private key
    let signedTransaction = await ledgerRes.sendCoins(sendToAddress, ledgerBipIndex, txFee, payAmount)
    //console.log(signedTransaction)

    //broadcast the transaction to the Resistance network
    let sentTransaction = await ledgerRes.sendRawTransaction(signedTransaction)
    //console.log(sentTransaction)

  } catch (err) {
    console.log(err)
  }
})();
