// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CardGame} from "../src/CardGame.sol";

contract DeployCardGame is Script {
    function run() external returns (CardGame game) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);
        game = new CardGame();
        vm.stopBroadcast();

        console.log("CardGame deployed to:", address(game));
        console.log("Card count:", game.cardCount());
    }
}
