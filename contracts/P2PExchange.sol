pragma solidity ^0.4.15;

import "./lib/StandardToken.sol";


contract P2PExchange {

    mapping(address => mapping(uint => address)) public filled;
    mapping(address => mapping(uint => bool)) public cancelled;
    mapping(address => uint) public wrappedETH;

    // Deposit your ETH
    function() public payable {
        // No one going to overflow uint256 with ETH
        wrappedETH[msg.sender] += msg.value;
    }

    function withdraw(address currency, uint amount) public returns (bool) {
        if (currency == 0x0) {
            if (amount <= wrappedETH[msg.sender]) {
                wrappedETH[msg.sender] -= amount;
                return msg.sender.send(amount);
            } else {
                return false;
            }
        } else {
            return StandardToken(currency)
            .transferFrom(msg.sender, msg.sender, amount);
        }
    }

    event InsufficientFunds(
        address indexed debtor,
        address indexed currency
    );

    event IncorrectFunds(address indexed taker);

    enum TransactionFailureReason {
        Cancelled,
        Expired,
        Filled,
        IllogicalTransaction,
        InvalidSignature
    }

    event TransactionFailed(
        TransactionFailureReason reason,
        address indexed maker,
        address indexed taker,
        uint    indexed uuid
    );

    struct P2POrder {
        address maker;
        address selling;
        uint    sellQuantity;
        address buying;
        uint    buyQuantity;
        uint    expiration;
        uint    uuid;
        bytes32 r;
        bytes32 s;
    }

    function exchange(
        uint[9] memory _order,
        uint8  v
    ) payable public returns (bool)
    {
        P2POrder memory order = P2POrder(
            address(_order[0]),
            address(_order[1]),
            _order[2],
            address(_order[3]),
            _order[4],
            _order[5],
            _order[6],
            bytes32(_order[7]),
            bytes32(_order[8])
        );

        // Fail if order is cancelled
        if (cancelled[order.maker][order.uuid]) {
            TransactionFailed(
                TransactionFailureReason.Cancelled,
                order.maker,
                msg.sender,
                order.uuid
            );
            return false;
        }

        // Fail is order has been filled
        if (filled[order.maker][order.uuid] != 0x0) {
            TransactionFailed(
                TransactionFailureReason.Filled,
                order.maker,
                msg.sender,
                order.uuid
            );
            return false;
        }

        // Fail if signature is invalid
        bytes32 h = keccak256(_order);
        // TODO need to use prefixing
        address signer = ecrecover(h, v, order.r, order.s);
        if (signer != order.maker) {
            TransactionFailed(
                TransactionFailureReason.InvalidSignature,
                order.maker,
                msg.sender,
                order.uuid
            );
            return false;
        }

        // Fail if order is expired
        if (now > order.expiration) {
            TransactionFailed(
                TransactionFailureReason.Expired,
                order.maker,
                msg.sender,
                order.uuid
            );
            return false;
        }

        if (order.selling == order.buying) {
            TransactionFailed(
                TransactionFailureReason.IllogicalTransaction,
                order.maker,
                msg.sender,
                order.uuid
            );
            return false;
        }

        /* ========== Begin token swap logic ==========
            Order is signed, not expired, not a replay, and not cancelled
            Now we can swap assets
        */

        StandardToken selling;
        StandardToken buying;

        if (order.selling == 0x0) {

            // Sell ETH for token

            buying = StandardToken(order.buying);

            if (wrappedETH[order.maker] < order.sellQuantity) {
                InsufficientFunds(order.maker, order.selling);
                return false;
            }

            if (_insufficientToken(msg.sender, buying, order.buyQuantity)) {
                return false;
            }

            wrappedETH[order.maker] -= order.sellQuantity;
            msg.sender.transfer(order.sellQuantity);

            buying.transferFrom(msg.sender, order.maker, order.buyQuantity);
        } else if (order.buying == 0x0) {

            // Sell Token for ETH

            selling = StandardToken(order.selling);
            if (msg.value != order.buyQuantity) {
                IncorrectFunds(msg.sender);
                return false;
            }

            if (_insufficientToken(order.maker, selling, order.sellQuantity)) {
                return false;
            }

            order.maker.transfer(order.buyQuantity);

            require(
                selling.transferFrom(order.maker, msg.sender, order.sellQuantity)
            );
        } else {
            // Sell Token1 for Token2
            selling = StandardToken(order.selling);
            buying = StandardToken(order.buying);

            if (_insufficientToken(msg.sender, buying, order.buyQuantity)) {
                return false;
            }


            if (_insufficientToken(order.maker, selling, order.sellQuantity)) {
                return false;
            }

            require(
                selling.transferFrom(order.maker, msg.sender, order.sellQuantity)
            );

            require(
                buying.transferFrom(msg.sender, order.maker, order.buyQuantity)
            );
        }

        filled[order.maker][order.uuid] = msg.sender;
    }

    function _insufficientToken(
        address _address,
        StandardToken token,
        uint amount
    ) private returns (bool)
    {
        if (token.allowance(_address, this) < amount) {
            InsufficientFunds(_address, token);
            return true;
        }
        return false;
    }
}