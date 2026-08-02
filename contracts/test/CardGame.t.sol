// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {CardGame} from "../src/CardGame.sol";

contract CardGameTest is Test {
    CardGame game;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    receive() external payable {}

    function setUp() public {
        game = new CardGame();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    /// 卡牌 id 与数组索引对齐（index 0 为占位）
    function testCardIdsAligned() public {
        uint256 n = game.cardCount();
        assertEq(n, 30);
        for (uint256 i = 1; i <= n; i++) {
            CardGame.Card memory c = game.getCard(i);
            assertEq(c.id, i, "id/index alignment");
            assertTrue(bytes(c.name).length > 0, "name non-empty");
        }
        assertEq(game.getCard(0).id, 0, "placeholder at 0");
    }

    /// 开包：0.001 RITUAL → 5张不重复卡
    function testOpenPack() public {
        uint256 price = game.PACK_PRICE();
        uint256 balBefore = address(game).balance;
        vm.prank(alice);
        game.mintPack{value: price}();
        assertEq(address(game).balance, balBefore + price);
        (uint256[] memory ids, uint256[] memory counts) = game.getCollection(alice);
        assertEq(ids.length, 5);
        for (uint256 i = 0; i < ids.length; i++) {
            assertEq(counts[i], 1);
        }
    }

    function testPackValueCheck() public {
        vm.expectRevert(bytes("wrong amount"));
        vm.prank(alice);
        game.mintPack{value: 1}();
    }

    function _collectDistinct(address who, uint256 maxPacks) internal returns (uint256[10] memory deck, uint256 n) {
        uint256 price = game.PACK_PRICE();
        for (uint256 p = 0; p < maxPacks; p++) {
            vm.prank(who);
            game.mintPack{value: price}();
            (uint256[] memory ids, ) = game.getCollection(who);
            if (ids.length >= 10) {
                for (uint256 i = 0; i < 10; i++) deck[i] = ids[i];
                return (deck, ids.length);
            }
        }
        revert("not enough distinct");
    }

    /// 组卡组：10张不同的已拥有卡
    function testSaveDeck() public {
        (uint256[10] memory deck, ) = _collectDistinct(alice, 15);
        vm.prank(alice);
        game.saveDeck(deck);
        uint256[10] memory saved = game.getDeck(alice);
        for (uint256 i = 0; i < 10; i++) assertEq(saved[i], deck[i]);
        assertTrue(game.deckValid(alice, deck));
    }

    function testInvalidDeckRejected() public {
        uint256[10] memory deck;
        deck[0] = 999; // non-existent card
        vm.expectRevert(bytes("invalid deck"));
        vm.prank(alice);
        game.saveDeck(deck);
    }

    /// 完整一局：开包→组牌→开战→出牌→攻击→结束回合(Bot回合)→获胜
    function testFullGame() public {
        (uint256[10] memory deck, ) = _collectDistinct(alice, 15);
        vm.prank(alice);
        uint256 matchId = game.startSoloMatch(deck);
        assertEq(matchId, 1);

        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.phase, 1);
        assertEq(m.players[0].heroHp, 30);
        assertEq(m.players[1].heroHp, 30);
        assertEq(m.players[0].maxMana, 1);

        // 玩家打出第一张费用<=1的手牌（若无1费牌则跳过）
        CardGame.Match memory m0 = game.getMatch(matchId);
        uint256 played = 0;
        for (uint256 i = 0; i < 5; i++) {
            uint256 cid = m0.players[0].hand[i];
            if (cid != 0 && game.getCard(cid).cost <= m0.players[0].mana) {
                vm.prank(alice);
                game.playCard(matchId, i);
                played = cid;
                break;
            }
        }

        // 结束回合 → Bot行动 → 回到玩家回合
        vm.prank(alice);
        game.endTurn(matchId);
        m = game.getMatch(matchId);
        assertEq(m.phase, 1, "game still active");
        assertEq(m.turn, 0, "back to player");
        assertEq(m.players[0].maxMana, 2, "mana ramped");

        // 玩家随从攻击敌方英雄（若 Bot 已杀掉我方随从则跳过）
        m = game.getMatch(matchId);
        bool attacked = false;
        for (uint256 i = 0; i < 5 && !attacked; i++) {
            if (m.players[0].board[i].cardId != 0 && m.players[0].board[i].canAct) {
                vm.prank(alice);
                game.attack(matchId, i, 1, 0);
                attacked = true;
            }
        }
        if (attacked) {
            m = game.getMatch(matchId);
            assertTrue(m.players[1].heroHp < 30, "bot hero damaged");
        } else {
            assertEq(game.getMatch(matchId).phase, 1, "game still active");
        }
    }

    /// 连续对局直到分出胜负（无死锁）
    function testGameTerminates() public {
        (uint256[10] memory deck, ) = _collectDistinct(alice, 15);
        vm.prank(alice);
        uint256 matchId = game.startSoloMatch(deck);
        for (uint256 round = 0; round < 50; round++) {
            CardGame.Match memory m = game.getMatch(matchId);
            if (m.phase == 2) break;
            // 玩家：出可负担的牌（每打一张刷新状态；棋盘满则停）
            for (uint256 i = 0; i < 5; i++) {
                m = game.getMatch(matchId);
                if (m.phase == 2) break;
                uint256 cid = m.players[0].hand[i];
                if (cid == 0) continue;
                uint256 boardCount = 0;
                for (uint256 b = 0; b < 5; b++) {
                    if (m.players[0].board[b].cardId != 0) boardCount++;
                }
                if (boardCount >= 5) break;
                if (game.getCard(cid).cost <= m.players[0].mana) {
                    vm.prank(alice);
                    game.playCard(matchId, i);
                }
            }
            // 全部随从打脸（每次攻击后刷新）
            for (uint256 i = 0; i < 5; i++) {
                m = game.getMatch(matchId);
                if (m.phase == 2) break;
                if (m.players[0].board[i].cardId != 0 && m.players[0].board[i].canAct) {
                    vm.prank(alice);
                    game.attack(matchId, i, 1, 0);
                }
            }
            m = game.getMatch(matchId);
            if (m.phase == 2) break;
            vm.prank(alice);
            game.endTurn(matchId);
        }
        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.phase, 2, "game must terminate");
    }

    function testWithdrawFees() public {
        uint256 price = game.PACK_PRICE();
        vm.prank(alice);
        game.mintPack{value: price}();
        uint256 balBefore = address(this).balance;
        game.withdrawFees();
        assertEq(address(game).balance, 0);
        assertGt(address(this).balance, balBefore);
    }
}
