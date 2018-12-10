import 'babel-polyfill';
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import AppBtc from "@ledgerhq/hw-app-btc";
import Client from 'bitcoin-core'
import coinSelect from 'coinselect'
import winston from 'winston'


const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [
  	new winston.transports.Console({ format: winston.format.simple() })
  ]
});


async function getRPCClient() {
	let clientInstance = new Client({
    network: 'testnet',
    host: '127.0.0.1',
    port: 18232,
    username: 'barterres',
    password: 'xt89hYfpCieLU8HjFjNU3+1vwA2AegCVmNR0jQC5MUM=',
    logger: logger,
    timeout: 10000
  })
  
  return clientInstance
}

Number.prototype.toFixedDown = function(digits) {
    var re = new RegExp("(\\d+\\.\\d{" + digits + "})(\\d)"),
        m = this.toString().match(re);
    return m ? parseFloat(m[1]) : this.valueOf();
};

async function addWatchOnly(address) {
	try {
		let rpcclient = await getRPCClient()
		let result = await rpcclient.importAddress(address, "", true)
		return result
	} catch (err) {
		console.log(err)
		return err
	}
}

async function sendRawTransaction(transaction){
	try {
		let rpcclient = await getRPCClient()
		let result = await rpcclient.sendRawTransaction(transaction)
		return result
	} catch (err) {
		console.log(err)
		return err
	}
}

async function getTxIds(address){
	try {
		let rpcclient = await getRPCClient()
		let received = await rpcclient.listReceivedByAddress(0, true, true)

		for(var i = 0; i < received.length; i++){
			if(received[i].address == address){
				return received[i].txids
			}
		}
	} catch (err) {
		console.log(err)
		return err
	}
}

async function getTx(txid){
	try {
		let rpcclient = await getRPCClient()
		let transaction = await rpcclient.getRawTransaction(txid)
		return transaction
	} catch (err) {
		console.log(err)
		return err
	}
}

async function createRawTransaction(finalinputs, finaloutputs){
	try {
		let rpcclient = await getRPCClient()
		let transaction = await rpcclient.createRawTransaction(finalinputs, finaloutputs)
		return transaction
	} catch (err) {
		console.log(err)
		return err
	}
}

async function createAndSignTransaction(btc, inputs, outputs, changeAddress) {
	// outputs - inputs = transaction fee
	var finalinputs = []
	var middleinputs = []
	var finaloutputs = {}

	var sumInputs = 0
	var sumOutputs = 0
	var fee = 0.0001

	var keypath = "0'/0'/0"
	var associatedkeypaths = []

	var changepath = "0'/0'/0"

	for(var i = 0; i < inputs.length; i++){
		let tx = await getTx(inputs[i].txid)
		var inputsm = {txid: inputs[i].txid, vout: inputs[i].vout}
		var inputsi = [btc.splitTransaction(tx), inputs[i].vout]
		finalinputs.push(inputsi)
		middleinputs.push(inputsm)
		sumInputs += inputs[i].value
		associatedkeypaths.push(keypath)
	}

	for(var i = 0; i < outputs.length; i++){
		finaloutputs[outputs[i].address] = outputs[i].value
		sumOutputs += outputs[i].value
	}

	// Add change address, inputs - (outputs + fees)
	var change = sumInputs - (sumOutputs + fee)
	finaloutputs[changeAddress] = change.toFixedDown(6)

	console.log("About to create raw transaction")
	console.log(middleinputs, finaloutputs)
	var txOutRaw = await createRawTransaction(middleinputs,finaloutputs)
	var txOut = btc.splitTransaction(txOutRaw)
	const outputScript = btc.serializeTransactionOutputs(txOut).toString('hex');

	console.log(associatedkeypaths)

	try {
		let signedTransaction = await btc.createPaymentTransactionNew(
			finalinputs,
			associatedkeypaths,
			changepath,
			outputScript
		)
		return signedTransaction
	} catch (err) {
		console.log(err)
	}
}

async function getUTXOs(address){
	try {
		let utxos = []
		let rpcclient = await getRPCClient()
		let allUTXOs = await rpcclient.listUnspent()
		//console.log(utxos)
		for(var i = 0; i < allUTXOs.length; i++){
			if(allUTXOs[i].address == address){
				//console.log(JSON.stringify(allUTXOs[i]))
				allUTXOs[i].value = allUTXOs[i].amount
				utxos.push(allUTXOs[i])
			}
		}
		return utxos
	} catch (err) {
		console.log(err)
		return err;
	}
}

async function getLedgerAddressBalance(address){
	try{
		var balance = 0
		let rpcclient = await getRPCClient()
		let allUTXOs = await rpcclient.listUnspent()
		//console.log(allUTXOs)
		for(var i = 0; i < allUTXOs.length; i++){
			if(allUTXOs[i].address == address){
				balance += allUTXOs[i].amount
			}
		}
		return balance
	} catch (err) {
		console.log(err)
		return err
	}
}

async function getPublicKey(btc, count) {
	try{
	  const pubKey = await btc.getWalletPublicKey("0'/0'/" + count);
	  return pubKey
	} catch (err) {
		console.log("Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
		process.exit()
	}
}

async function sendCoins(to_address, bip32_index, fee, amount){
	fee.toFixedDown(8)
	let rpcclient = await getRPCClient()
	let info = await rpcclient.getInfo()
	var btc = ""
	try {
		const transport = await TransportNodeHid.create(1000);
  	btc = new AppBtc(transport);
  } catch (err) {
  	//console.log(err)
  	console.log("Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
  	process.exit()
  }

	try {
		var publicKey = await getPublicKey(btc, bip32_index)
		var resAddress = publicKey.bitcoinAddress
		console.log(resAddress)
	} catch (err) {
		//console.log(err.message)
		console.log("Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
  	process.exit()
	}

	let watchOnlyResult = await addWatchOnly(resAddress)
	let balance = await getLedgerAddressBalance(resAddress)
	console.log("Address: " + resAddress + " Balance: " + JSON.stringify(balance))
	let utxos = await getUTXOs(resAddress)
	let targets = [{address:to_address, value:amount}]
	let { inputs, outputs} = await coinSelect(utxos, targets, fee)
	if (!inputs || !outputs) {console.log("Can't create transaction, not enough coins."); process.exit()}

	let signedTransaction = await createAndSignTransaction(btc, inputs, outputs, resAddress)
	return signedTransaction
}

(async () => {

	//get public address
	/*var btc = ""
	try {
		const transport = await TransportNodeHid.create(1000);
  	btc = new AppBtc(transport);
  	console.log(await getPublicKey(btc, 0))
  	process.exit()
  } catch (err) {
  	console.log(err)
  	console.log("Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
  	process.exit()
  }*/

  //send some coins
  let signedTransaction = await sendCoins('rp5wwANPBfBaEEJCnTFGL7Nfa3Fp2cj3fq3', 0, 0.0001, 1)
  console.log(signedTransaction)
  let sentTransaction = await sendRawTransaction(signedTransaction)

  /*let rpcclient = await getRPCClient()
	let info = await rpcclient.getInfo()
	console.log(info)*/
})();
