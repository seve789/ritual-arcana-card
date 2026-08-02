// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CardGame — 轻量级卡牌链游 (Ritual Chain)
/// @notice 收藏(开卡包) → 组卡组(10张) → 对战(单人对战链上AI Bot)
/// @dev 纯 EVM 确定性逻辑，无异步 precompile 依赖，保证轻量可靠
contract CardGame {
    // ==================== Types ====================
    struct Card {
        uint256 id;
        string name;
        uint8 rarity; // 0=common 1=rare 2=epic 3=legendary
        uint8 cost;   // mana cost
        uint8 atk;
        uint8 hp;
    }

    struct Minion {
        uint256 cardId; // 0 = empty slot
        uint256 atk;
        uint256 hp;
        uint256 maxHp;
        bool canAct;    // summoning sickness
    }

    struct PlayerState {
        uint256 heroHp;
        uint256 mana;
        uint256 maxMana;
        uint256 deckIdx;
        uint256[10] deck; // card ids
        uint256[5] hand;  // card ids, 0 = empty
        Minion[5] board;
        bool isBot;
    }

    struct Match {
        uint256 id;
        PlayerState[2] players; // [0]=challenger(human), [1]=bot
        uint256 turn;           // always 0 in solo mode (bot acts inside endTurn)
        uint256 seed;
        uint8 phase;            // 1=active 2=finished
        address winner;
    }

    // ==================== Constants ====================
    address public constant BOT = address(0xB0B);
    uint256 public constant HERO_HP = 30;
    uint256 public constant MAX_MANA = 10;
    uint256 public constant HAND_SIZE = 5;
    uint256 public constant BOARD_SIZE = 5;
    uint256 public constant DECK_SIZE = 10;
    uint256 public constant PACK_PRICE = 1e15; // 0.001 RITUAL
    uint256 public constant CARDS_PER_PACK = 5;

    // ==================== State ====================
    address public owner;
    Card[] public cards; // id = index (0 unused)
    mapping(address => mapping(uint256 => uint256)) public balanceOf; // player => cardId => count
    mapping(address => uint256[10]) public decks;
    uint256 public matchCounter;
    mapping(uint256 => Match) public matches;
    uint256 private packNonce;

    // ==================== Events ====================
    event PackOpened(address indexed player, uint256[] cardIds);
    event DeckSaved(address indexed player);
    event MatchStarted(uint256 indexed matchId, address indexed player, uint256 seed);
    event Log(uint256 indexed matchId, address indexed actor, string text);
    event MatchEnded(uint256 indexed matchId, address indexed winner);

    // ==================== Modifiers ====================
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ==================== Constructor ====================
    constructor() {
        owner = msg.sender;
        cards.push(Card(0, "", 0, 0, 0, 0)); // index 0 占位，保证 cardId == arrayIndex
        _addCard("Ember Sprite", 0, 1, 2, 1);
        _addCard("Void Pup", 0, 1, 1, 2);
        _addCard("Cipher Wisp", 0, 1, 1, 1);
        _addCard("Bone Guard", 0, 2, 2, 2);
        _addCard("Tinker Drone", 0, 2, 1, 3);
        _addCard("Ritual Initiate", 0, 2, 2, 3);
        _addCard("Arcane Raven", 0, 3, 2, 3);
        _addCard("Stone Acolyte", 0, 2, 1, 4);
        _addCard("Glass Golem", 0, 3, 3, 3);
        _addCard("Chain Ward", 0, 3, 2, 4);
        _addCard("Rust Sentinel", 0, 4, 3, 4);
        _addCard("Ember Fang", 0, 4, 4, 3);
        _addCard("Hash Hound", 1, 3, 3, 3);
        _addCard("Enclave Witch", 1, 4, 3, 5);
        _addCard("TEE Guardian", 1, 4, 4, 4);
        _addCard("Fault-Slip Rogue", 1, 3, 4, 2);
        _addCard("Merkle Druid", 1, 5, 4, 5);
        _addCard("Scheduler Sage", 1, 5, 4, 4);
        _addCard("Zero-Knowledge Monk", 1, 5, 3, 6);
        _addCard("Dapp Raider", 1, 4, 5, 3);
        _addCard("Onyx Oracle", 1, 6, 5, 5);
        _addCard("Shard Shaman", 1, 6, 4, 6);
        _addCard("Genesis Fork", 2, 6, 6, 5);
        _addCard("Attestation Angel", 2, 7, 6, 6);
        _addCard("Node Master", 2, 7, 5, 8);
        _addCard("Precompile Titan", 2, 8, 7, 7);
        _addCard("TEE Seraph", 2, 8, 6, 8);
        _addCard("Async Overlord", 3, 8, 9, 7);
        _addCard("Ritual Phoenix", 3, 9, 8, 8);
        _addCard("The Enshrined One", 3, 10, 10, 10);
    }

    function _addCard(string memory name, uint8 rarity, uint8 cost, uint8 atk, uint8 hp) internal {
        cards.push(Card(cards.length, name, rarity, cost, atk, hp));
    }

    // ==================== Collection ====================
    /// @notice 开一包卡：0.001 RITUAL，获得5张不重复的随机卡
    function mintPack() external payable {
        require(msg.value == PACK_PRICE, "wrong amount");
        uint256 seed = uint256(
            keccak256(abi.encode(block.prevrandao, block.timestamp, packNonce++, msg.sender))
        );
        uint256[5] memory ids = _rollPack(seed);
        uint256[] memory result = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            balanceOf[msg.sender][ids[i]]++;
            result[i] = ids[i];
        }
        emit PackOpened(msg.sender, result);
    }

    function getCollection(address player) external view returns (uint256[] memory ids, uint256[] memory counts) {
        uint256 owned = 0;
        for (uint256 i = 1; i < cards.length; i++) {
            if (balanceOf[player][i] > 0) owned++;
        }
        ids = new uint256[](owned);
        counts = new uint256[](owned);
        uint256 k = 0;
        for (uint256 i = 1; i < cards.length; i++) {
            if (balanceOf[player][i] > 0) {
                ids[k] = i;
                counts[k] = balanceOf[player][i];
                k++;
            }
        }
    }

    // ==================== Deck ====================
    function saveDeck(uint256[10] calldata deck) external {
        require(deckValid(msg.sender, deck), "invalid deck");
        for (uint256 i = 0; i < DECK_SIZE; i++) {
            decks[msg.sender][i] = deck[i];
        }
        emit DeckSaved(msg.sender);
    }

    function getDeck(address player) external view returns (uint256[10] memory) {
        return decks[player];
    }

    function deckValid(address player, uint256[10] memory deck) public view returns (bool) {
        for (uint256 i = 0; i < DECK_SIZE; i++) {
            uint256 id = deck[i];
            if (id == 0 || id >= cards.length) return false;
            if (balanceOf[player][id] == 0) return false;
            for (uint256 j = i + 1; j < DECK_SIZE; j++) {
                if (deck[j] == id) return false;
            }
        }
        return true;
    }

    // ==================== Match ====================
    /// @notice 开始单人(对AI)对局
    function startSoloMatch(uint256[10] calldata deck) external returns (uint256) {
        require(deckValid(msg.sender, deck), "invalid deck");
        matchCounter++;
        Match storage m = matches[matchCounter];
        m.id = matchCounter;
        m.phase = 1;
        m.seed = uint256(keccak256(abi.encode(block.prevrandao, block.timestamp, matchCounter, msg.sender)));

        // Player deck (shuffled)
        uint256[10] memory d0;
        for (uint256 i = 0; i < DECK_SIZE; i++) d0[i] = deck[i];
        d0 = _shuffle(d0, _rng(m.seed, 1));
        _copyDeck(m.players[0].deck, d0);
        m.players[0].heroHp = HERO_HP;
        m.players[0].maxMana = 1;
        m.players[0].mana = 1;
        m.players[0].isBot = false;

        // Bot deck (10 random distinct cards, shuffled)
        uint256[10] memory d1 = _pickBotDeck(_rng(m.seed, 2));
        d1 = _shuffle(d1, _rng(m.seed, 3));
        _copyDeck(m.players[1].deck, d1);
        m.players[1].heroHp = HERO_HP;
        m.players[1].maxMana = 1;
        m.players[1].mana = 1;
        m.players[1].isBot = true;

        m.turn = 0;
        _draw(m, 0);
        _draw(m, 0);
        _draw(m, 0);
        _draw(m, 1);
        _draw(m, 1);
        _draw(m, 1);

        emit MatchStarted(matchCounter, msg.sender, m.seed);
        return matchCounter;
    }

    /// @notice 从手牌打出随从 (handIdx 0-4)
    function playCard(uint256 matchId, uint256 handIdx) external {
        Match storage m = matches[matchId];
        require(m.phase == 1 && m.turn == 0, "not active or not your turn");
        PlayerState storage p = m.players[0];
        require(handIdx < HAND_SIZE && p.hand[handIdx] != 0, "empty hand slot");
        Card storage c = cards[p.hand[handIdx]];
        require(c.cost <= p.mana, "not enough mana");
        require(_boardCount(p) < BOARD_SIZE, "board full");
        p.mana -= c.cost;
        p.hand[handIdx] = 0;
        _placeMinion(p, c.id, false);
        emit Log(matchId, msg.sender, string.concat("You summon ", _cardName(c.id)));
    }

    /// @notice 随从攻击。targetType: 0=敌方随从, 1=敌方英雄
    function attack(uint256 matchId, uint256 attackerIdx, uint8 targetType, uint256 targetIdx) external {
        Match storage m = matches[matchId];
        require(m.phase == 1 && m.turn == 0, "not your turn");
        PlayerState storage p = m.players[0];
        require(attackerIdx < BOARD_SIZE && p.board[attackerIdx].cardId != 0, "bad attacker");
        Minion storage atk = p.board[attackerIdx];
        require(atk.canAct, "minion already acted");
        PlayerState storage e = m.players[1];

        if (targetType == 1) {
            uint256 dmg = atk.atk;
            e.heroHp = e.heroHp > dmg ? e.heroHp - dmg : 0;
            atk.canAct = false;
            emit Log(matchId, msg.sender, string.concat(_cardName(atk.cardId), " hits enemy hero for ", _uint2str(dmg)));
            if (e.heroHp == 0) {
                _endMatch(m, msg.sender);
            }
        } else {
            require(targetIdx < BOARD_SIZE && e.board[targetIdx].cardId != 0, "bad target");
            Minion storage tgt = e.board[targetIdx];
            uint256 dmgToTgt = atk.atk;
            uint256 dmgToAtk = tgt.atk;
            tgt.hp = tgt.hp > dmgToTgt ? tgt.hp - dmgToTgt : 0;
            atk.hp = atk.hp > dmgToAtk ? atk.hp - dmgToAtk : 0;
            atk.canAct = false;
            emit Log(matchId, msg.sender, string.concat(_cardName(atk.cardId), " attacks ", _cardName(tgt.cardId)));
            if (tgt.hp == 0) {
                tgt.cardId = 0;
                emit Log(matchId, msg.sender, string.concat("Enemy ", _cardName(atk.cardId), "'s target destroyed"));
            }
            if (atk.hp == 0) {
                atk.cardId = 0;
                emit Log(matchId, msg.sender, string.concat("Your ", _cardName(atk.cardId), " is destroyed"));
            }
        }
    }

    /// @notice 结束回合：链上Bot自动出牌+攻击，然后回到玩家回合
    function endTurn(uint256 matchId) external {
        Match storage m = matches[matchId];
        require(m.phase == 1 && m.turn == 0, "not your turn");

        // --- Bot turn ---
        PlayerState storage bot = m.players[1];
        // 新回合开始：场上随从解除召唤失调
        _refreshBoard(bot);
        _draw(m, 1);
        bot.maxMana = bot.maxMana >= MAX_MANA ? MAX_MANA : bot.maxMana + 1;
        bot.mana = bot.maxMana;

        // Bot plays affordable cards
        for (uint256 i = 0; i < HAND_SIZE; i++) {
            uint256 cid = bot.hand[i];
            if (cid == 0) continue;
            uint256 cost = cards[cid].cost;
            if (cost <= bot.mana && _boardCount(bot) < BOARD_SIZE) {
                bot.mana -= cost;
                bot.hand[i] = 0;
                _placeMinion(bot, cid, false);
                emit Log(matchId, BOT, string.concat("Enemy summons ", _cardName(cid)));
            }
        }

        // Bot attacks: kill-able weakest enemy minion first, else hero
        for (uint256 i = 0; i < BOARD_SIZE; i++) {
            Minion storage bm = bot.board[i];
            if (bm.cardId == 0 || !bm.canAct) continue;
            int256 best = -1;
            uint256 bestHp = type(uint256).max;
            for (uint256 j = 0; j < BOARD_SIZE; j++) {
                Minion storage em = m.players[0].board[j];
                if (em.cardId == 0) continue;
                if (em.hp <= bm.atk && em.hp < bestHp) {
                    bestHp = em.hp;
                    best = int256(j);
                }
            }
            bm.canAct = false;
            if (best >= 0) {
                Minion storage tgt = m.players[0].board[uint256(best)];
                uint256 dmgToTgt = bm.atk;
                uint256 dmgToAtk = tgt.atk;
                tgt.hp = tgt.hp > dmgToTgt ? tgt.hp - dmgToTgt : 0;
                bm.hp = bm.hp > dmgToAtk ? bm.hp - dmgToAtk : 0;
                emit Log(matchId, BOT, string.concat("Enemy ", _cardName(bm.cardId), " attacks your ", _cardName(tgt.cardId)));
                if (tgt.hp == 0) {
                    tgt.cardId = 0;
                    emit Log(matchId, BOT, "Your minion is destroyed");
                }
                if (bm.hp == 0) {
                    bm.cardId = 0;
                }
            } else {
                uint256 dmg = bm.atk;
                PlayerState storage p0 = m.players[0];
                p0.heroHp = p0.heroHp > dmg ? p0.heroHp - dmg : 0;
                emit Log(matchId, BOT, string.concat("Enemy ", _cardName(bm.cardId), " hits your hero for ", _uint2str(dmg)));
                if (p0.heroHp == 0) {
                    _endMatch(m, BOT);
                    return;
                }
            }
        }

        // --- Player turn ---
        PlayerState storage p = m.players[0];
        _refreshBoard(p);
        _draw(m, 0);
        p.maxMana = p.maxMana >= MAX_MANA ? MAX_MANA : p.maxMana + 1;
        p.mana = p.maxMana;
        m.turn = 0;
    }

    function getMatch(uint256 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getCard(uint256 id) external view returns (Card memory) {
        return cards[id];
    }

    function cardCount() external view returns (uint256) {
        return cards.length - 1;
    }

    // ==================== Owner ====================
    function withdrawFees() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    // ==================== Internal ====================
    function _rng(uint256 seed, uint256 salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, salt)));
    }

    function _shuffle(uint256[10] memory arr, uint256 seed) internal pure returns (uint256[10] memory) {
        for (uint256 i = DECK_SIZE - 1; i > 0; i--) {
            uint256 j = _rng(seed, i) % (i + 1);
            (arr[i], arr[j]) = (arr[j], arr[i]);
        }
        return arr;
    }

    function _pickBotDeck(uint256 seed) internal pure returns (uint256[10] memory d) {
        uint256[30] memory all;
        for (uint256 i = 0; i < 30; i++) all[i] = i + 1;
        for (uint256 i = 29; i > 0; i--) {
            uint256 j = _rng(seed, i) % (i + 1);
            (all[i], all[j]) = (all[j], all[i]);
        }
        for (uint256 i = 0; i < DECK_SIZE; i++) d[i] = all[i];
    }

    function _rollPack(uint256 seed) internal view returns (uint256[5] memory res) {
        uint256 n = cards.length - 1;
        uint256 salt = 0;
        for (uint256 i = 0; i < CARDS_PER_PACK; i++) {
            uint256 id = 1 + (_rng(seed, salt++) % n);
            uint256 tries = 0;
            while (_contains(res, id) && tries < 30) {
                id = 1 + (_rng(seed, salt++) % n);
                tries++;
            }
            res[i] = id;
        }
    }

    function _contains(uint256[5] memory arr, uint256 v) internal pure returns (bool) {
        for (uint256 i = 0; i < CARDS_PER_PACK; i++) {
            if (arr[i] == v) return true;
        }
        return false;
    }

    function _copyDeck(uint256[10] storage dst, uint256[10] memory src) internal {
        for (uint256 i = 0; i < DECK_SIZE; i++) dst[i] = src[i];
    }

    function _draw(Match storage m, uint256 playerIdx) internal {
        PlayerState storage p = m.players[playerIdx];
        if (_handCount(p) >= HAND_SIZE || p.deckIdx >= DECK_SIZE) return;
        uint256 cid = p.deck[p.deckIdx];
        p.deckIdx++;
        for (uint256 i = 0; i < HAND_SIZE; i++) {
            if (p.hand[i] == 0) {
                p.hand[i] = cid;
                break;
            }
        }
    }

    function _placeMinion(PlayerState storage p, uint256 cardId, bool canAct) internal {
        Card storage c = cards[cardId];
        for (uint256 i = 0; i < BOARD_SIZE; i++) {
            if (p.board[i].cardId == 0) {
                p.board[i] = Minion(cardId, c.atk, c.hp, c.hp, canAct);
                return;
            }
        }
    }

    function _refreshBoard(PlayerState storage p) internal {
        for (uint256 i = 0; i < BOARD_SIZE; i++) {
            if (p.board[i].cardId != 0) p.board[i].canAct = true;
        }
    }

    function _boardCount(PlayerState storage p) internal view returns (uint256 n) {
        for (uint256 i = 0; i < BOARD_SIZE; i++) {
            if (p.board[i].cardId != 0) n++;
        }
    }

    function _handCount(PlayerState storage p) internal view returns (uint256 n) {
        for (uint256 i = 0; i < HAND_SIZE; i++) {
            if (p.hand[i] != 0) n++;
        }
    }

    function _endMatch(Match storage m, address winner) internal {
        m.phase = 2;
        m.winner = winner;
        emit MatchEnded(m.id, winner);
    }

    function _cardName(uint256 id) internal view returns (string memory) {
        return cards[id].name;
    }

    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 tmp = value;
        uint256 digits;
        while (tmp != 0) {
            digits++;
            tmp /= 10;
        }
        bytes memory buf = new bytes(digits);
        while (value != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buf);
    }
}
