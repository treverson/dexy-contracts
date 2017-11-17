pragma solidity ^0.4.15;

import "./lib/StandardToken.sol";


contract Exchange {

    address public broker;
    mapping(address => mapping(uint => uint)) public filled;
    mapping(uint => bool) public authorized;
    mapping(address => mapping(uint => bool)) public cancelled;

    mapping(address => uint) public wrappedETH;

    function Exchange() public {
        broker = msg.sender;
    }

    // Deposit your ETH
    function() public payable {
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

    enum FailureReason {
        AuthorizationExpired,
        AuthorizationUsed,
        Cancelled,
        Expired,
        Filled,
        IllogicalTransaction,
        InvalidSignature,
        Unauthorized
    }

    event TransactionFailed(
        FailureReason reason,
        address indexed maker,
        address indexed taker,
        uint    indexed nonce
    );

    struct Order {
        address buying;
        uint    buyQuantity;
        uint    expiration;
        address maker;
        address selling;
        uint    sellQuantity;
        uint    nonce;
    }

    struct Authorization {
        uint    amount;
        uint    expiration;
        uint    fee;
        address taker;
        uint    nonce;
    }

    function exchange(
        uint[7]    memory _order,
        uint[5]    memory _authorization,
        bytes32[4] memory signatures,
        uint8[2]   memory vs
    ) payable public returns (bool)
    {
        Order memory order = Order(
            address(_order[0]),
            _order[1],
            _order[2],
            address(_order[3]),
            address(_order[4]),
            _order[5],
            _order[6]
        );

        Authorization memory authorization = Authorization(
            _authorization[0],
            _authorization[1],
            _authorization[2],
            address(_authorization[3]),
            _authorization[4]
        );

        // CANCELLED
        if (cancelled[order.maker][order.nonce]) {
            return _fail(FailureReason.Cancelled, order);
        }

        // EXPIRED
        if (now > order.expiration) {
            return _fail(FailureReason.Expired, order);
        }

        // FILLED
        if (order.sellQuantity - filled[order.maker][order.nonce] < authorization.amount) {
            return _fail(FailureReason.Filled, order);
        }

        // AUTHORIZATION RE-ENTRANCY
        if (authorized[authorization.nonce] == true) {
            return _fail(FailureReason.AuthorizationUsed, order);
        }

        // Fail if signature is invalid
        bytes32 h = keccak256(_order);
        address signer = _recoverPrefixed(h, vs[0], signatures[0], signatures[1]);
        if (signer != order.maker) {
            return _fail(FailureReason.InvalidSignature, order);
        }

        h = keccak256(h, _authorization);
        signer = _recoverPrefixed(h, vs[1], signatures[2], signatures[3]);
        if (signer != broker) {
            return _fail(FailureReason.Unauthorized, order);
        }

        if (order.selling == order.buying) {
            return _fail(FailureReason.IllogicalTransaction, order);
        }

        // VALIDATE CORRECT FUNDS
        if (order.buying == 0x0) {
            if (msg.value != order.buyQuantity + authorization.fee) {
                IncorrectFunds(msg.sender);
                return false;
            }
        } else {
            if (msg.value != authorization.fee) {
                IncorrectFunds(msg.sender);
                return false;
            }
        }


        // TX FEE TO BROKER
        broker.transfer(authorization.fee);

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
            if (msg.value != order.buyQuantity + authorization.fee) {
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

        filled[order.maker][order.nonce] += authorization.amount;
        authorized[authorization.nonce] = true;
    }

    function cancel(uint nonce) public {
        cancelled[msg.sender][nonce] = true;
    }

    function _fail(FailureReason reason, Order order) private returns (bool) {
        TransactionFailed(reason, order.maker, msg.sender, order.nonce);
        return false;
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

    function _recoverPrefixed(
        bytes32 h,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) pure private returns (address)
    {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        return ecrecover(keccak256(prefix, h), v, r, s);
    }
}