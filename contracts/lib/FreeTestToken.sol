pragma solidity ^0.4.15;

import "./StandardToken.sol";

contract FreeTestToken is StandardToken {

    function mint(uint amount) public {
        balances[msg.sender] += amount;        
    }
}