'use strict'
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid"
import AppBtc from "@ledgerhq/hw-app-btc"
import coinSelect from 'coinselect'
import errorList from "./error"

Number.prototype.toFixedDown = digits => {
  const re = new RegExp(`(\d+\.\d{${digits}})(\d)`)
  m = this.toString().match(re)
  return m ? parseFloat(m[1]) : this.valueOf()
}

class LedgerResError extends Error {
  constructor(err) {
    const { name, message } = err
    const { error } = name
    super(error || message)
    this.name = name
    this.code = errorList[name]
  }
}

export default class LedgerRes {
  constructor(rpcClient) {
    this.rpcClient = rpcClient
    this.btcTransport = null
  }

  async init() {
    try {
      const transport = await TransportNodeHid.create(1000)
      this.btcTransport = new AppBtc(transport)
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  // Public functions
  async getPublicKey(count) {
    try {
      const pubKey = await this.btcTransport.getWalletPublicKey(`0'/0'/${count}`)
      return pubKey
    } catch (err) {
      throw new LedgerResError(err)
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
      const result = await this.rpcClient.importAddress(address, '', true)
      return result
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async sendRawTransaction(transaction){
    try {
      const result = await this.rpcClient.sendRawTransaction(transaction)
      return result
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async getTxIds(address){
    try {
      const received = await this.rpcClient.listReceivedByAddress(0, true, true)

      for (let i = 0; i < received.length; i+=1) {
        if(received[i].address === address){
          return received[i].txids
        }
      }
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async getTx(txid) {
    try {
      const transaction = await this.rpcClient.getRawTransaction(txid)
      return transaction
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async createRawTransaction(finalinputs, finaloutputs) {
    try {
      const transaction = await this.rpcClient.createRawTransaction(finalinputs, finaloutputs)
      return transaction
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async createAndSignTransaction(inputs, outputs, changeAddress) {
    // Outputs - inputs = transaction fee

    const finalinputs = []
    const middleinputs = []
    const finaloutputs = {}

    let sumInputs = 0
    let sumOutputs = 0
    const fee = 0.0001

    const keypath = `0'/0'/0`
    const associatedkeypaths = []

    const changepath = `0'/0'/0`

    for (let i = 0; i < inputs.length; i+=1) {
      const tx = await this.getTx(inputs[i].txid)

      try {
        const inputsm = {txid: inputs[i].txid, vout: inputs[i].vout}
        const inputsi = [this.btcTransport.splitTransaction(tx), inputs[i].vout]

        finalinputs.push(inputsi)
        middleinputs.push(inputsm)
        sumInputs += inputs[i].value
        associatedkeypaths.push(keypath)

      } catch(err) {
        throw new LedgerResError(err)
      }
    }

    for (let i = 0; i < outputs.length; i+=1) {
      finaloutputs[outputs[i].address] = outputs[i].value
      sumOutputs += outputs[i].value
    }

    // Add change address, inputs - (outputs + fees)
    const change = sumInputs - (sumOutputs + fee)
    finaloutputs[changeAddress] = change.toFixedDown(6)

    const outputScript = null

    try {
      const txOutRaw = await this.createRawTransaction(middleinputs, finaloutputs)
      const txOut = this.btcTransport.splitTransaction(txOutRaw)
      const outputScript = this.btcTransport.serializeTransactionOutputs(txOut).toString('hex')

      const signedTransaction = await this.btcTransport.createPaymentTransactionNew(
        finalinputs,
        associatedkeypaths,
        undefined, // changepath,
        outputScript
      )
      return signedTransaction

    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async getUTXOs(address) {
    try {
      const utxos = []
      const allUTXOs = await this.rpcClient.listUnspent()

      for (let i = 0; i < allUTXOs.length; i+=1) {
        if(allUTXOs[i].address === address){
          allUTXOs[i].value = allUTXOs[i].amount
          utxos.push(allUTXOs[i])
        }
      }
      return utxos
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async getLedgerAddressBalance(address) {
    try {
      let balance = 0
      const allUTXOs = await this.rpcClient.listUnspent()

      for (var i = 0; i < allUTXOs.length; i+=1) {
        if(allUTXOs[i].address === address) {
          balance += allUTXOs[i].amount
        }
      }

      return balance
    } catch (err) {
      throw new LedgerResError(err)
    }
  }

  async sendCoins(toAddress, bip32Index, fee, amount) {
    fee.toFixedDown(8)

    try {
      const info = await this.rpcClient.getInfo()

      try {
        try {
          const publicKey = await this.getPublicKey(bip32Index)
          const resAddress = publicKey.bitcoinAddress
        } catch (err) {
          throw new LedgerResError(err)
        }

        const watchOnlyResult = await this.addWatchOnly(resAddress)
        const balance = await this.getLedgerAddressBalance(resAddress)
        const utxos = await this.getUTXOs(resAddress)
        const targets = [{address: toAddress, value: amount}]
        const { inputs, outputs } = await coinSelect(utxos, targets, fee)

        if (!inputs || !outputs) {
            throw new LedgerResError({
                name: `CoinSplit Error`,
                message: `Not enough coins.`
            })
        }

        let signedTransaction = await this.createAndSignTransaction(inputs, outputs, resAddress)
        return signedTransaction
      } catch(err) {
        throw new LedgerResError(err)
      }
    } catch(err) {
      throw new LedgerResError(err)
    }
  }

}
