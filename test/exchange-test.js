'use strict'

const crypto = require('crypto')
const Exchange = artifacts.require("./Exchange.sol")
const ABCToken = artifacts.require('./ABCToken.sol')
const XYZToken = artifacts.require('./XYZToken.sol')

const { expect, assert } = require('chai')
const _ = require('lodash')

const optimum = require('optimum-order-utils')

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

contract('Exchange', function(accounts) {

    console.log('accounts:', accounts)

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

        it('errors when a user withdraws more token than they have', () => {
            let msg = 'expected this to fail'
            return exchange.withdraw(abc.address, web3.toWei(100000))
            .then(() => {
                throw new Error(msg)
            })
            .catch(err => {
                if (err.message !== msg) {
                    throw new Error('User can withdraw more token than they have')
                }
            })
        })

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

            return abc.approve(exchange.address, web3.toWei(1000), { from: taker })
            .then(() => {
                return exchange.sendTransaction({ from: maker, value: web3.toWei(10) })
            })
            .then(() => takeOrder(order))
            .then(optimum.utils.printLogs)
            .then(result => {
                // TODO add expectations here about balances
                let success = _getSuccess(result)
                expect(success).to.not.eq(undefined)
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

        it('can exchange ETH for Token', () => {
            let order = ethForTokenOrder()

            return exchange.sendTransaction({ from: maker, value: web3.toWei(10) })
            .then(() => abc.approve(exchange.address, web3.toWei(1000), {
                from: taker
            }))
            .then(() => takeOrder(order))
            .then(result => {
                let success = _getSuccess(result)
                expect(success).to.not.eq(undefined)
            })
        })

        it('can exchange Token for Token', () => {
            let order = tokenForTokenOrder()

            return abc.approve(exchange.address, web3.toWei(1000), { from: taker })
            .then(() => {
                return xyz.approve(exchange.address, web3.toWei(10), { from: maker })
            })
            .then(() => {
                return takeOrder(order)
            })
            .then(result => {
                console.log(result)
                let event = _getSuccess(result)
                expect(event).to.not.eq(undefined)
            })
        })

        it('can exchnage Token for ETH', () => {
            let order = tokenForEthOrder()

            return abc.approve(exchange.address, web3.toWei(1000), { from: maker })
            .then(() => takeOrder(order))
            .then(result => {
                let success = _getSuccess(result)
                console.log(result)
                expect(success).to.not.eq(undefined)
            })
        })

        it('can partially fill an order', () => {
            let order = optimum.Order.fromForm({
                buying: abc.address,
                buyQuantity: '1000',
                expiration: optimum.utils.secondsFromNow(120),
                maker: maker,
                selling: '0x0',
                sellQuantity: '10'
            })

            let auth = order.authorization({
                amount: '200',
                expiration: optimum.utils.secondsFromNow(120),
                fee: '0.0001',
                taker: taker
            })

            let orderSig
            let authSig

            return exchange.sendTransaction({ from: maker, value: web3.toWei(2) })
            .then(() => {
                return abc.approve(exchange.address, web3.toWei(200), { from: taker })
            })
            .then(() => order.sign(web3))
            .then(sig => {
                orderSig = sig
                return auth.sign(web3)
            })
            .then(sig => {
                authSig = sig

                return exchange.trade(
                    order.toSolidity(),
                    auth.toSolidity(),
                    map0xPrefix([orderSig.r, orderSig.s, authSig.r, authSig.s]),
                    [orderSig.v, authSig.v],
                    {
                        from: taker,
                        value: auth.fee
                    }
                )
            })
            .then(optimum.utils.printLogs)
            .then(result => {
                console.log(result)

                console.log(result)
                let success = _getSuccess(result)
                expect(success).to.not.eq(undefined)
            })
        })
    })

    function takeOrder(order) {
        console.log('#takeOrder', order)

        let authorization = _authorizationForOrder(order)

        let paddedOrder = _pad(_orderToArray(order))
        let paddedAuth = _pad(_authorizationToArray(authorization))

        let orderSig
        let authSig

        const packedOrder = paddedOrder.join('')
        const packedAuth = paddedAuth.join('')
        console.log(packedOrder)
        console.log(packedAuth)
        let orderHash = web3.sha3(packedOrder, { encoding: 'hex' })
        let authHash = web3.sha3(orderHash.slice(2) + packedAuth, { encoding: 'hex' })

        console.log('order hash:', orderHash)
        console.log('auth hash:', authHash)

        return sign(orderHash)
        .then(signature => {
            orderSig = signature

            return sign( authHash )
        })
        .then(sig => {
            authSig = sig

            const signatures = map0xPrefix([
                orderSig.r,
                orderSig.s,
                authSig.r,
                authSig.s
            ])

            let value = web3.toBigNumber(web3.toWei(0.0001))

            if (order.buying == '0x0') {
                value = value.add(order.buyQuantity)
            }

            return exchange
            .trade(map0xPrefix(paddedOrder), map0xPrefix(paddedAuth), signatures, [
                orderSig.v,
                authSig.v
            ], { from: taker, value: value })
        })
    }

    function ethForTokenOrder() {
        return {
            buying: abc.address,
            buyQuantity: web3.toBigNumber(web3.toWei(1000)),
            expiration: _oneDay(),
            maker: web3.eth.coinbase,
            selling: '0x0',
            sellQuantity: web3.toBigNumber(web3.toWei(10)),
            nonce: _nonce()
        }
    }
    
    function tokenForEthOrder() {
        return {
            buying: '0x0',
            buyQuantity: web3.toBigNumber(web3.toWei(10)),
            expiration: _oneDay(),
            maker: web3.eth.coinbase,
            selling: abc.address,
            sellQuantity: web3.toBigNumber(web3.toWei(1000)),
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
            amount: order.buyQuantity,
            expiration: _oneDay(),
            fee: web3.toWei(0.0001),
            nonce: _nonce(),
            taker: taker
        }
    }
})

function sign(data) {
    console.log('signing:', data, 'for:', web3.eth.coinbase)
    return new Promise((resolve, reject) => {
        web3.eth.sign(web3.eth.coinbase, data, (err, sig) => {
            if (err)
                return reject(err)

            let formatted = {
                r: sig.slice(2, 66),
                s: sig.slice(66, 130),
                v: web3.toDecimal('0x' + sig.slice(130))
            }

            if (formatted.v <= 1) {
                formatted.v += 27
            }

            console.log(formatted)
            resolve(formatted)
        })
    })
}

function map0xPrefix(padded) {
    return _.map(padded, item => '0x' + item)
}

function _pad(array) {
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

function _getSuccess(result) {
    return _getEvent('TransactionSucceeded', result.logs)
}

function _oneDay() {
    return Math.floor(new Date().setDate(new Date().getDate() + 1) / 1000)
}

function _nonce() {
    return '0x' + crypto.randomBytes(32).toString('hex')
}