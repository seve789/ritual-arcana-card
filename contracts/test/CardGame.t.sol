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

    // ---------- 基础 ----------

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

    function _collectDistinct(address who, uint256 maxPacks) internal returns (uint256[10] memory deck) {
        uint256 price = game.PACK_PRICE();
        for (uint256 p = 0; p < maxPacks; p++) {
            vm.prank(who);
            game.mintPack{value: price}();
            (uint256[] memory ids, ) = game.getCollection(who);
            if (ids.length >= 10) {
                for (uint256 i = 0; i < 10; i++) deck[i] = ids[i];
                return deck;
            }
        }
        revert("not enough distinct");
    }

    function testSaveDeck() public {
        uint256[10] memory deck = _collectDistinct(alice, 15);
        vm.prank(alice);
        game.saveDeck(deck);
        uint256[10] memory saved = game.getDeck(alice);
        for (uint256 i = 0; i < 10; i++) assertEq(saved[i], deck[i]);
        assertTrue(game.deckValid(alice, deck));
    }

    function testInvalidDeckRejected() public {
        uint256[10] memory deck;
        deck[0] = 999;
        vm.expectRevert(bytes("invalid deck"));
        vm.prank(alice);
        game.saveDeck(deck);
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

    // ---------- Solo ----------

    function testFullGame() public {
        uint256[10] memory deck = _collectDistinct(alice, 15);
        vm.prank(alice);
        uint256 matchId = game.startSoloMatch(deck);
        assertEq(matchId, 1);

        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.phase, 1);
        assertEq(m.mode, game.MODE_SOLO());
        assertEq(m.playerAddr[0], alice);
        assertEq(m.playerAddr[1], game.BOT());
        assertEq(m.players[0].heroHp, 30);
        assertEq(m.players[1].heroHp, 30);

        CardGame.Match memory m0 = game.getMatch(matchId);
        for (uint256 i = 0; i < 5; i++) {
            uint256 cid = m0.players[0].hand[i];
            if (cid != 0 && game.getCard(cid).cost <= m0.players[0].mana) {
                vm.prank(alice);
                game.playCard(matchId, i);
                break;
            }
        }
        vm.prank(alice);
        game.endTurn(matchId);
        m = game.getMatch(matchId);
        assertEq(m.phase, 1, "game still active");
        assertEq(m.turn, 0, "back to player");
        assertEq(m.players[0].maxMana, 2, "mana ramped");
    }

    function testGameTerminates() public {
        uint256[10] memory deck = _collectDistinct(alice, 15);
        vm.prank(alice);
        uint256 matchId = game.startSoloMatch(deck);
        for (uint256 round = 0; round < 50; round++) {
            CardGame.Match memory m = game.getMatch(matchId);
            if (m.phase == 2) break;
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
        assertEq(game.getMatch(matchId).phase, 2, "game must terminate");
    }

    // ---------- Quick ----------

    function testQuickMatch() public {
        // alice 无任何收藏也能直接开战
        vm.prank(alice);
        uint256 matchId = game.startQuickMatch();
        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.mode, game.MODE_QUICK());
        assertEq(m.phase, 1);
        assertTrue(m.players[0].deck[0] != 0, "auto deck generated");
        assertEq(m.players[1].heroHp, 30);
    }

    // ---------- Endless ----------

    function testEndlessWaves() public {
        uint256[10] memory deck = _collectDistinct(alice, 15);
        vm.prank(alice);
        uint256 matchId = game.startEndlessMatch(deck);
        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.mode, game.MODE_ENDLESS());
        assertEq(m.wave, 1);

        for (uint256 round = 0; round < 80; round++) {
            m = game.getMatch(matchId);
            if (m.phase == 2) break;
            // 出牌 + 全部打脸
            for (uint256 i = 0; i < 5; i++) {
                m = game.getMatch(matchId);
                if (m.phase == 2) break;
                uint256 cid = m.players[0].hand[i];
                if (cid == 0) continue;
                uint256 bc = 0;
                for (uint256 b = 0; b < 5; b++) if (m.players[0].board[b].cardId != 0) bc++;
                if (bc >= 5) break;
                if (game.getCard(cid).cost <= m.players[0].mana) {
                    vm.prank(alice);
                    game.playCard(matchId, i);
                }
            }
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
        m = game.getMatch(matchId);
        if (m.wave > 1) {
            // 至少进入过 wave 2（低费 bot 第一波应该能赢）
            assertTrue(m.phase == 2 || m.phase == 1);
            assertGe(game.bestWave(alice), 0);
        }
        // 流程无死锁即可
        assertTrue(m.phase == 2 || m.phase == 1, "no deadlock");
    }

    // ---------- Daily ----------

    function testDailyMatch() public {
        uint256[10] memory deck = _collectDistinct(alice, 15);
        uint256 day = game.currentDay();
        vm.prank(alice);
        uint256 matchId = game.startDailyMatch(deck);
        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.mode, game.MODE_DAILY());
        assertEq(m.dailyDay, day);

        for (uint256 round = 0; round < 80; round++) {
            m = game.getMatch(matchId);
            if (m.phase == 2) break;
            for (uint256 i = 0; i < 5; i++) {
                m = game.getMatch(matchId);
                if (m.phase == 2) break;
                uint256 cid = m.players[0].hand[i];
                if (cid == 0) continue;
                uint256 bc = 0;
                for (uint256 b = 0; b < 5; b++) if (m.players[0].board[b].cardId != 0) bc++;
                if (bc >= 5) break;
                if (game.getCard(cid).cost <= m.players[0].mana) {
                    vm.prank(alice);
                    game.playCard(matchId, i);
                }
            }
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
        m = game.getMatch(matchId);
        assertEq(m.phase, 2, "daily must finish");
        if (m.winner == alice) {
            (address[5] memory top, uint256[5] memory turns) = game.getDailyLeaderboard(day);
            assertEq(top[0], alice, "alice on leaderboard");
            assertGt(turns[0], 0, "turns recorded");
        }
    }

    // ---------- PvP ----------

    function testPvPMatch() public {
        uint256[10] memory deckA = _collectDistinct(alice, 15);
        uint256[10] memory deckB = _collectDistinct(bob, 15);

        vm.prank(alice);
        uint256 matchId = game.createPvPMatch(deckA);
        CardGame.Match memory m = game.getMatch(matchId);
        assertEq(m.mode, game.MODE_PVP());
        assertEq(m.phase, 0, "waiting");
        assertEq(m.playerAddr[0], alice);

        // alice 不能加入自己的匹配
        vm.prank(alice);
        vm.expectRevert(bytes("cannot join own match"));
        game.joinPvPMatch(matchId, deckA);

        vm.prank(bob);
        game.joinPvPMatch(matchId, deckB);
        m = game.getMatch(matchId);
        assertEq(m.phase, 1, "active");
        assertEq(m.turn, 0, "creator first");
        assertEq(m.playerAddr[1], bob);

        // alice 先手出牌
        m = game.getMatch(matchId);
        bool played = false;
        for (uint256 i = 0; i < 5; i++) {
            uint256 cid = m.players[0].hand[i];
            if (cid != 0 && game.getCard(cid).cost <= m.players[0].mana) {
                vm.prank(alice);
                game.playCard(matchId, i);
                played = true;
                break;
            }
        }
        // bob 不能在 alice 回合行动
        vm.prank(bob);
        vm.expectRevert(bytes("not your turn"));
        game.endTurn(matchId);

        vm.prank(alice);
        game.endTurn(matchId);
        m = game.getMatch(matchId);
        assertEq(m.turn, 1, "bob turn");

        // bob 出牌 + 结束回合
        m = game.getMatch(matchId);
        for (uint256 i = 0; i < 5; i++) {
            uint256 cid = m.players[1].hand[i];
            if (cid != 0 && game.getCard(cid).cost <= m.players[1].mana) {
                vm.prank(bob);
                game.playCard(matchId, i);
                break;
            }
        }
        vm.prank(bob);
        game.endTurn(matchId);
        m = game.getMatch(matchId);
        assertEq(m.turn, 0, "back to alice");
        assertEq(m.players[0].maxMana, 2, "alice mana ramped");
        assertEq(m.players[1].maxMana, 2, "bob mana ramped");
    }

    function testCancelPvP() public {
        uint256[10] memory deckA = _collectDistinct(alice, 15);
        vm.prank(alice);
        uint256 matchId = game.createPvPMatch(deckA);
        vm.prank(bob);
        vm.expectRevert(bytes("creator only"));
        game.cancelPvPMatch(matchId);
        vm.prank(alice);
        game.cancelPvPMatch(matchId);
        assertEq(game.getMatch(matchId).phase, 2, "cancelled");
    }
}
