'use strict';

require('babel-polyfill');

var _bitcoinCore = require('bitcoin-core');

var _bitcoinCore2 = _interopRequireDefault(_bitcoinCore);

var _winston = require('winston');

var _winston2 = _interopRequireDefault(_winston);

var _ledgerRes = require('./ledger-res');

var _ledgerRes2 = _interopRequireDefault(_ledgerRes);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(async () => {

  try {

    const logger = _winston2.default.createLogger({
      level: 'debug',
      format: _winston2.default.format.json(),
      transports: [new _winston2.default.transports.Console({ format: _winston2.default.format.simple() })]
    });

    let rpcClient = new _bitcoinCore2.default({
      network: 'testnet',
      host: '127.0.0.1',
      port: 18132,
      username: '',
      password: '',
      logger: logger,
      timeout: 10000
    });

    if (!rpcClient.username || !rpcClient.password) {
      console.log("\nError: You need to set your RPC username and password in example.js. Exiting...\n");
      process.exit();
    }

    let ledgerRes = new _ledgerRes2.default(rpcClient);
    await ledgerRes.init(); //must call this to initialize connection to ledger
    console.log((await ledgerRes.getPublicKey(0)));

    //send some coins
    //set coin sending parameters
    let ledgerBipIndex = 0;
    let sendToAddress = 'rp5wwANPBfBaEEJCnTFGL7Nfa3Fp2cj3fq3';
    let txFee = 0.0001;
    let payAmount = 1;

    //sign the transaction using the ledger private key
    let signedTransaction = await ledgerRes.sendCoins(sendToAddress, ledgerBipIndex, txFee, payAmount);
    console.log(signedTransaction);

    //broadcast the transaction to the Resistance network
    let sentTransaction = await ledgerRes.sendRawTransaction(signedTransaction);
  } catch (err) {
    console.log(err);
  }
  /*if(ledgerRes.btcTransport){
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
  } else {
    console.log("5 Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
  }*/
})();