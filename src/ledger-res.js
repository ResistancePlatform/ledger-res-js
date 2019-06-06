'use strict'

import "@babel/polyfill";

import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import AppBtc from "@ledgerhq/hw-app-btc";
import coinSelect from 'coinselect'
import errorList from "./error"

Number.prototype.toFixedDown = function(digits) {
  var re = new RegExp("(\\d+\\.\\d{" + digits + "})(\\d)"),
  m = this.toString().match(re);
  return m ? parseFloat(m[1]) : this.valueOf();
}

class LedgerResError extends Error {
  constructor(err) {
    var name = err.name
    var message = err.message
    const { error } = name
    super(error || message)
    this.name = name
    this.code = errorList[name]
  }
}

export default class LedgerRes {
 constructor(rpcClient){
    this.rpcClient = rpcClient
  }

  async getDevice() {
    try {
      const transport = await TransportNodeHid.create(100, 100);
      const ledger = new AppBtc(transport);

      ledger.close = () => transport.close();
      return ledger

    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async getPublicKey(count) {
    try{
      const ledger = await this.getDevice();
      const bitcoinAddress = await ledger.getWalletPublicKey("0'/0'/" + count);
      await ledger.close();
      return bitcoinAddress;

    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async isAvailable() {
    try {
      await this.getPublicKey(0);
      return true;
    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async getRpcClient() {
    return this.rpcClient
  }

  async addWatchOnly(address) {
    try {
      let result = await this.rpcClient.importAddress(address, "", false)
      return result
    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async sendRawTransaction(transaction){
    try {
      let result = await this.rpcClient.sendRawTransaction(transaction)
      return result
    } catch (err) {
      throw new LedgerResError(err);
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
      throw new LedgerResError(err);
    }
  }

  async getTx(txid){
    try {
      let transaction = await this.rpcClient.getRawTransaction(txid)
      return transaction
    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async createRawTransaction(finalinputs, finaloutputs){
    try {
      let transaction = await this.rpcClient.createRawTransaction(finalinputs, finaloutputs)
      //console.log(transaction)
      return transaction
    } catch (err) {
      throw new LedgerResError(err);
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

    const ledger = await this.getDevice();

    for(var i = 0; i < inputs.length; i++){
      let tx = await this.getTx(inputs[i].txid)
      try {
        var inputsm = {txid: inputs[i].txid, vout: inputs[i].vout}
        var inputsi = [ledger.splitTransaction(tx), inputs[i].vout]
        finalinputs.push(inputsi)
        middleinputs.push(inputsm)
        sumInputs += inputs[i].value
        associatedkeypaths.push(keypath)
      } catch(err) {
        throw new LedgerResError(err);
      }
    }

    for(var i = 0; i < outputs.length; i++){
      finaloutputs[outputs[i].address] = outputs[i].value
      sumOutputs += outputs[i].value
    }

    // Add change address, inputs - (outputs + fees)
    var change = sumInputs - (sumOutputs + fee)
    //finaloutputs[changeAddress] = change.toFixedDown(6)

    const outputScript = null

    try {
      var txOutRaw = await this.createRawTransaction(middleinputs,finaloutputs)
      var txOut = ledger.splitTransaction(txOutRaw)
      const outputScript = ledger.serializeTransactionOutputs(txOut).toString('hex');

      let signedTransaction = await ledger.createPaymentTransactionNew(
        finalinputs,
        associatedkeypaths,
        undefined, //changepath,
        outputScript,
        0, //locktime
        undefined, //sigHashType
        undefined, //segwit
        undefined, //initialTimestamp
        ["sapling"], //additionals
        Buffer.from([0x00, 0x00, 0x00, 0x00])

      )
      console.log(signedTransaction)
      return signedTransaction

    } catch (err) {
      throw new LedgerResError(err);
    } finally {
      ledger.close()
    }
  }

  async getUTXOs(address){
    try {
      let utxos = []
      let allUTXOs = await this.rpcClient.listUnspent()
      for(var i = 0; i < allUTXOs.length; i++){
        if(allUTXOs[i].address == address){
          allUTXOs[i].value = allUTXOs[i].amount
          utxos.push(allUTXOs[i])
        }
      }
      return utxos
    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async getLedgerAddressBalance(address){
    try{
      var balance = 0
      let watchOnlyResult = await this.addWatchOnly(address)
      let allUTXOs = await this.rpcClient.listUnspent()
      for(var i = 0; i < allUTXOs.length; i++){
        if(allUTXOs[i].address == address){
          balance += allUTXOs[i].amount
        }
      }
      return balance
    } catch (err) {
      throw new LedgerResError(err);
    }
  }

  async sendCoins(to_address, bip32_index, fee, amount){
    fee.toFixedDown(8)
    try {
      let info = await this.rpcClient.getInfo()
      try {
        try {
          var publicKey = await this.getPublicKey(bip32_index)
          var resAddress = publicKey.bitcoinAddress
        } catch (err) {
          throw new LedgerResError(err);
        }

        let watchOnlyResult = await this.addWatchOnly(resAddress)
        let balance = await this.getLedgerAddressBalance(resAddress)
        let utxos = await this.getUTXOs(resAddress)
        let targets = [{address:to_address, value:amount}]
        let { inputs, outputs} = await coinSelect(utxos, targets, fee)
        if (!inputs || !outputs) {throw new LedgerResError({name:"CoinSplit Error",message:"Not enough coins."})}

        let signedTransaction = await this.createAndSignTransaction(inputs, outputs, resAddress)
        return signedTransaction
      } catch(err) {
        throw new LedgerResError(err);
      }
    } catch(err) {
      throw new LedgerResError(err);
    }
  }

}
