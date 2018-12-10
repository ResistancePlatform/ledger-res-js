'use strict'
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import AppBtc from "@ledgerhq/hw-app-btc";
import coinSelect from 'coinselect'

Number.prototype.toFixedDown = function(digits) {
  var re = new RegExp("(\\d+\\.\\d{" + digits + "})(\\d)"),
  m = this.toString().match(re);
  return m ? parseFloat(m[1]) : this.valueOf();
}

export default class LedgerRes {
	constructor(rpcClient){
		this.rpcClient = rpcClient
		this.btcTransport = null
	}

	async init(){
		try {
			const transport = await TransportNodeHid.create(1000);
	  	this.btcTransport = new AppBtc(transport);
	  } catch (err) {
	  	console.log(err)
	  	console.log("1 Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
	  	this.btcTransport = null
	  }
	}

	//public functions
	async getPublicKey(count) {
		try{
		  const pubKey = await this.btcTransport.getWalletPublicKey("0'/0'/" + count);
		  return pubKey
		} catch (err) {
			console.log("2 Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
		}
	}

	async getRpcClient() {
		return this.rpcClient
	}

	async getBtcTransport() {
		return this.btcTransport
	}

	async addWatchOnly(address) {
		try {
			let result = await this.rpcClient.importAddress(address, "", true)
			return result
		} catch (err) {
			console.log(err)
			return err
		}
	}

	async sendRawTransaction(transaction){
		try {
			let result = await this.rpcClient.sendRawTransaction(transaction)
			return result
		} catch (err) {
			console.log(err)
			return err
		}
	}

	async getTxIds(address){
		try {
			let received = await this.rpcClient.listReceivedByAddress(0, true, true)

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

	async getTx(txid){
		try {
			let transaction = await this.rpcClient.getRawTransaction(txid)
			return transaction
		} catch (err) {
			console.log(err)
			return err
		}
	}

	async createRawTransaction(finalinputs, finaloutputs){
		try {
			let transaction = await this.rpcClient.createRawTransaction(finalinputs, finaloutputs)
			return transaction
		} catch (err) {
			console.log(err)
			return err
		}
	}

	async createAndSignTransaction(inputs, outputs, changeAddress) {
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
			let tx = await this.getTx(inputs[i].txid)
			var inputsm = {txid: inputs[i].txid, vout: inputs[i].vout}
			var inputsi = [this.btcTransport.splitTransaction(tx), inputs[i].vout]
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
		var txOutRaw = await this.createRawTransaction(middleinputs,finaloutputs)
		var txOut = this.btcTransport.splitTransaction(txOutRaw)
		const outputScript = this.btcTransport.serializeTransactionOutputs(txOut).toString('hex');

		console.log(associatedkeypaths)

		try {
			let signedTransaction = await this.btcTransport.createPaymentTransactionNew(
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

	async getUTXOs(address){
		try {
			let utxos = []
			let allUTXOs = await this.rpcClient.listUnspent()
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

	async getLedgerAddressBalance(address){
		try{
			var balance = 0
			let allUTXOs = await this.rpcClient.listUnspent()
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

	async sendCoins(to_address, bip32_index, fee, amount){
		fee.toFixedDown(8)
		if(this.rpcClient){
			let info = await this.rpcClient.getInfo()
			if (this.btcTransport){
				try {
					var publicKey = await this.getPublicKey(bip32_index)
					var resAddress = publicKey.bitcoinAddress
					console.log(resAddress)
				} catch (err) {
					console.log(err.message)
					console.log("3 Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
			  	process.exit()
				}

				let watchOnlyResult = await this.addWatchOnly(resAddress)
				let balance = await this.getLedgerAddressBalance(resAddress)
				console.log("Address: " + resAddress + " Balance: " + JSON.stringify(balance))
				let utxos = await this.getUTXOs(resAddress)
				let targets = [{address:to_address, value:amount}]
				let { inputs, outputs} = await coinSelect(utxos, targets, fee)
				if (!inputs || !outputs) {console.log("Can't create transaction, not enough coins."); process.exit()}

				let signedTransaction = await this.createAndSignTransaction(inputs, outputs, resAddress)
				return signedTransaction
			} else {
				console.log("4 Ledger not accessible. Please make sure you have plugged in your Ledger, typed in your pin, and opened the Resistance application.")
				return false
			}
		} else {
			console.log("Could not connect to rpcclient.")
			return false
		}
	}

}