'use strict'

const crypto = require('crypto')
const Exchange = artifacts.require("./Exchange.sol")
const ABCToken = artifacts.require('./ABCToken.sol')
const XYZToken = artifacts.require('./XYZToken.sol')

const { expect, assert } = require('chai')
const _ = require('lodash')

const FailureReason = {
    AuthorizationExpired: web3.toBigNumber(0),
    AuthorizationUsed: web3.toBigNumber(1),
    Cancelled: web3.toBigNumber(2),
    Expired: web3.toBigNumber(3),
    Filled: web3.toBigNumber(4),
    IllogicalTransaction: web3.toBigNumber(5),
    InvalidSignature: web3.toBigNumber(6),
    Unauthorized: web3.toBigNumber(7)
}

contract('P2PExchange', function(accounts) {

    const maker = accounts[0]
    const taker = accounts[1]

    let exchange
    let abc
    let xyz

    before(() => {

        const TOKEN_MINT = web3.toWei(10000)

        return Exchange.deployed()
        .then(contract => {
            exchange = contract
            return ABCToken.deployed()
        })
        .then(contract => {
            abc = contract
            return Promise.all([
                abc.mint( TOKEN_MINT, { from: maker }),
                abc.mint( TOKEN_MINT, { from: taker })
            ])
        })
        .then(() => {
            return XYZToken.deployed()
        })
        .then(contract => {
            xyz = contract
            return Promise.all([
                xyz.mint( TOKEN_MINT, { from: maker }),
                xyz.mint( TOKEN_MINT, { from: taker })
            ])
        })
    })

    describe('fallback function', () => {
        it('stores deposits', () => {
            return exchange.sendTransaction({
                from: maker,
                value: web3.toWei(20)
            })
            .then(() => {
                expect(web3.eth.getBalance(exchange.address))
                .to.eql( web3.toBigNumber(web3.toWei(20)) )
                return exchange.wrappedETH.call(maker)
            })
            .then(balance => {
                expect(balance).to.eql( web3.toBigNumber(web3.toWei(20)) )
            })
        })
    })

    describe('withdraw', () => {
        it('prevents overdraft', () => {
            return exchange.withdraw.call('0x0', web3.toWei(21))
            .then(result => {
                expect(result).to.eq(false)
            })
            .then(() => {
                return exchange.withdraw('0x0', web3.toWei(21))
            })
            .then(() => {
                expect( web3.eth.getBalance(exchange.address ))
                .to.eql( web3.toBigNumber(web3.toWei(20)) )
                return exchange.wrappedETH.call(maker)
            })
            .then(balance => {
                // Ensure balance remains unchanged
                expect(balance).to.eql( web3.toBigNumber(web3.toWei(20)) )
            })
        })

        it('allows users to withdraw funds', () => {
            return exchange.withdraw('0x0', web3.toWei(20))
            .then(() => {
                return exchange.wrappedETH.call(maker)
            })
            .then(balance => {
                expect(balance.toNumber()).to.eq(0)
            })
        })

        it('returns false when a user withdraws more token than they have')

        it('allows users to withdraw a token')
    })

    describe('exchange', () => {
        it('emits TransactionFailed when order is cancelled', () => {
            let order = ethForTokenOrder()

            return exchange.cancel(order.nonce)
            .then(() => {
                return takeOrder(order)
            })
            .then((result) => {
                const failure = _getFailure(result)

                expect(failure.args.reason).to.eql(FailureReason.Cancelled)
            })
        })

        it('emits TransactionFailed when order is expired', () => {
            let order = ethForTokenOrder()
            order.expiration = Math.floor((new Date().setDate(new Date().getDate() - 1)) / 1000)

            return takeOrder(order)
            .then(result => {
                const failure = _getFailure(result)
                expect(failure.args.reason).to.eql(FailureReason.Expired)
            })
        })

        it.only('emits TransactionFailed when order is filled', () => {
            let order = ethForTokenOrder()

            return takeOrder(order)
            .then(result => {
                console.log(result)
                return takeOrder(order)
            })
            .then(result => {
                const failure = _getFailure(result)
                expect(failure.args.reason).to.eql(FailureReason.Filled)
            })
        })

        it('emits TransactionFailed when signature is invalid')

        it('emits TransactionFailed when order is unauthorized')

        it('emits InsufficientFunds when maker does not have enough ETH')

        it('emits InsufficientFunds when maker does not have enough Token')

        it('emits InsufficientFunds when taker does not send enough ETH')

        it('emits InsufficientFunds when taker does not have enough Token')

        it('can exchange ETH for Token')

        it('can exchange Token for Token')

        it('can exchnage Token for ETH')
    })

    function takeOrder(order) {
        console.log('#takeOrder', order)

        let authorization = _authorizationForOrder(order)

        let packedOrder = _pack(_orderToArray(order))
        let packedAuth = _pack(_authorizationToArray(authorization))

        let orderSig
        let authSig

        let orderHash = web3.sha3(packedOrder.join(''))
        let authHash = web3.sha3(packedAuth.join(''))
        console.log('order hash:', orderHash)
        console.log('auth hash:', authHash)

        return sign(orderHash)
        .then(signature => {
            orderSig = signature
            return sign(authHash)
        })
        .then(sig => {
            authSig = sig
        })
        .then(() => {

            return exchange
            .trade(_numeric(packedOrder), _numeric(packedAuth), [
                orderSig.r,
                orderSig.s,
                authSig.r,
                authSig.s
            ], [
                orderSig.v,
                authSig.v
            ], { from: taker })
        })
    }

    function ethForTokenOrder() {
        return {
            buying: abc.address,
            buyQuantity: web3.toWei(1000),
            expiration: _oneDay(),
            maker: web3.eth.coinbase,
            selling: '0x0',
            sellQuantity: web3.toWei(10),
            nonce: _nonce()
        }
    }
    
    function tokenForEthOrder() {
        return {
            buying: '0x0',
            buyQuantity: web3.toWei(1000),
            expiration: _oneDay(),
            maker: web3.eth.coinbase,
            selling: abc.address,
            sellQuantity: web3.toWei(10),
            nonce: _nonce()
        }
    }
    
    function tokenForTokenOrder() {
        return {
            buying: abc.address,
            buyQuantity: web3.toWei(1000),
            expiration: _oneDay(),
            maker: web3.eth.coinbase,
            selling: xyz.address,
            sellQuantity: web3.toWei(10),
            nonce: _nonce()
        }
    }


    function _authorizationForOrder(order) {
        return {
            amount: order.sellQuantity,
            expiration: _oneDay(),
            fee: web3.toWei(0.0001),
            nonce: _nonce(),
            taker: taker
        }
    }
})

function sign(data) {
    return new Promise((resolve, reject) => {
        web3.eth.sign(web3.eth.coinbase, data, (err, sig) => {
            if (err)
                return reject(err)

            let formatted = {
                r: sig.slice(2, 66),
                s: sig.slice(66, 130),
                v: parseInt(sig.slice(130))
            }

            if (formatted.v <= 1) {
                formatted.v += 27
            }

            console.log(formatted)
            resolve(formatted)
        })
    })
}

function _pack(array) {
    return _.map(array, value => {
        let hex = web3.toHex(value)
        return web3.padLeft(hex.slice(2), 64, '0')
    })
}

function _numeric(array) {
    return _.map(array, value => {
        if (typeof value === 'string') {
            if (value.slice(0, 2) == '0x') {
                return web3.toBigNumber(value)
            } else {
                return web3.toBigNumber('0x' + value)
            }
        } else {
            return web3.toBigNumber(value)
        }
    })
}

function _orderToArray(order) {
    return [
        order.buying,
        order.buyQuantity,
        order.expiration,
        order.maker,
        order.selling,
        order.sellQuantity,
        order.nonce
    ]
}

function _authorizationToArray(auth) {
    return [
        auth.amount,
        auth.expiration,
        auth.fee,
        auth.nonce,
        auth.taker
    ]
}

function _getFailure(result) {
    return _getEvent('TransactionFailed', result.logs)
}

function _getEvent(name, logs) {
    return _.find(logs, log => {
        return log.event === name;
    })
}

function _oneDay() {
    return Math.floor(new Date().setDate(new Date().getDate() + 1)) / 1000
}

function _nonce() {
    return '0x' + crypto.randomBytes(32).toString('hex')
}