pragma solidity ^0.4.15;

import "./lib/StandardToken.sol";


contract Exchange {

    address public broker;
    mapping(address => mapping(bytes32 => uint)) public filled;
    mapping(bytes32 => bool) public authorized;
    mapping(address => mapping(bytes32 => bool)) public cancelled;

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
        address indexed currency,
        uint    expected,
        uint    actual
    );

    event IncorrectFunds(address indexed taker, uint expected, uint sent);

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
        bytes32 indexed nonce
    );

    event TransactionSucceeded();

    event SignatureInvalid(
        bytes32 h,
        uint8   v,
        bytes32 r,
        bytes32 s
    );

    struct Order {
        address buying;
        uint    buyQuantity;
        uint    expiration;
        address maker;
        address selling;
        uint    sellQuantity;
        bytes32 nonce;
    }

    struct Authorization {
        uint    amount;
        uint    expiration;
        uint    fee;
        bytes32 nonce;
        address taker;
    }

    function trade(
        bytes32[7] memory _order,
        bytes32[5] memory _authorization,
        bytes32[4] memory signatures,
        uint8[2]   memory vs
    ) payable public returns (bool)
    {
        Order memory order = Order(
            address(_order[0]),
            uint(_order[1]),
            uint(_order[2]),
            address(_order[3]),
            address(_order[4]),
            uint(_order[5]),
            _order[6]
        );

        Authorization memory authorization = Authorization(
            uint(_authorization[0]),
            uint(_authorization[1]),
            uint(_authorization[2]),
            _authorization[3],
            address(_authorization[4])
        );

        // CANCELLED
        if (cancelled[order.maker][order.nonce])
            return _fail(FailureReason.Cancelled, order);

        // EXPIRED
        if (now > order.expiration)
            return _fail(FailureReason.Expired, order);

        // FILLED
        if (order.buyQuantity - filled[order.maker][order.nonce] < authorization.amount)
            return _fail(FailureReason.Filled, order);

        // DOUBLE-AUTH
        if (authorized[authorization.nonce] == true)
            return _fail(FailureReason.AuthorizationUsed, order);

        // Fail if signature is invalid
        bytes32 h = keccak256(_order);
        address signer = _recoverPrefixed(h, vs[0], signatures[0], signatures[1]);
        if (signer != order.maker) {
            SignatureInvalid(h, vs[0], signatures[0], signatures[1]);
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

        // VALIDATE FEE SENT
        // If taker is sending ETH we do this later
        if (order.buying != 0x0 && msg.value != authorization.fee) {
            IncorrectFunds(msg.sender, authorization.fee, msg.value);
            return false;
        }

        /* ========== Begin token swap logic ==========
            Order is signed, not expired, not a replay, and not cancelled
            Now we can swap assets
        */

        StandardToken selling;
        StandardToken buying;

        // TODO we can make rounding error nonexistant
        uint take = (order.sellQuantity * authorization.amount) / order.buyQuantity;

        if (order.selling == 0x0) {

            // Sell ETH for token

            buying = StandardToken(order.buying);

            if (wrappedETH[order.maker] < take) {
                InsufficientFunds(order.maker, order.selling, take, wrappedETH[order.maker]);
                return false;
            }

            if (_insufficientToken(msg.sender, buying, take)) {
                return false;
            }

            wrappedETH[order.maker] -= take;
            msg.sender.transfer(take);

            require(
                buying.transferFrom(msg.sender, order.maker, authorization.amount)
            );
        } else if (order.buying == 0x0) {

            // Sell Token for ETH

            selling = StandardToken(order.selling);

            if (msg.value != authorization.amount + authorization.fee) {
                IncorrectFunds(msg.sender, msg.value, authorization.amount + authorization.fee);
                return false;
            }

            if (_insufficientToken(order.maker, selling, take)) {
                return false;
            }

            order.maker.transfer(authorization.amount);

            require(
                selling.transferFrom(order.maker, msg.sender, take)
            );
        } else {
            // Sell Token1 for Token2
            selling = StandardToken(order.selling);
            buying = StandardToken(order.buying);

            if (_insufficientToken(msg.sender, buying, authorization.amount)) {
                return false;
            }


            if (_insufficientToken(order.maker, selling, take)) {
                return false;
            }

            require(
                selling.transferFrom(order.maker, msg.sender, take)
            );

            require(
                buying.transferFrom(msg.sender, order.maker, authorization.amount)
            );
        }

        filled[order.maker][order.nonce] += authorization.amount;
        authorized[authorization.nonce] = true;

        // TX FEE TO BROKER
        broker.transfer(authorization.fee);

        TransactionSucceeded();
    }

    function cancel(bytes32 nonce) public {
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
            InsufficientFunds(_address, token, amount, token.allowance(_address, this));
            return true;
        }
        return false;
    }

    function _recoverPrefixed(
        bytes32 h,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private returns (address)
    {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        return ecrecover(keccak256(prefix, h), v, r, s);
    }
}