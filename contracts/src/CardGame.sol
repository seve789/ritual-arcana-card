// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CardGame — 卡牌链游 (Ritual Chain)
/// @notice 五种玩法：Solo(单人对AI) / PvP(真人匹配) / Endless(无尽波次) / Daily(每日挑战) / Quick(随机卡组)
/// @dev 纯 EVM 确定性逻辑，无异步 precompile 依赖，轻量可靠
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
    }

    struct Match {
        uint256 id;
        uint8 mode;          // 0=solo 1=pvp 2=endless 3=daily 4=quick
        uint8 phase;         // 0=waiting(pvp) 1=active 2=finished
        uint256 turn;        // 0 or 1
        uint256 seed;
        address winner;
        address[2] playerAddr; // [0] 发起者, [1] 对手(或 BOT)
        uint256 wave;        // endless: 当前波次
        uint256 turnCount;   // 已进行回合数 (daily 计分)
        uint256 dailyDay;    // daily: 挑战日
        PlayerState[2] players;
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

    uint8 public constant MODE_SOLO = 0;
    uint8 public constant MODE_PVP = 1;
    uint8 public constant MODE_ENDLESS = 2;
    uint8 public constant MODE_DAILY = 3;
    uint8 public constant MODE_QUICK = 4;

    // ==================== State ====================
    address public owner;
    Card[] public cards; // id == index (0 占位)
    mapping(address => mapping(uint256 => uint256)) public balanceOf;
    mapping(address => uint256[10]) public decks;
    uint256 public matchCounter;
    mapping(uint256 => Match) public matches;
    uint256 private packNonce;

    // 无尽模式最高波次
    mapping(address => uint256) public bestWave;
    // 每日挑战排行榜 (day => top5 玩家/回合数)
    mapping(uint256 => address[5]) public dailyTopPlayers;
    mapping(uint256 => uint256[5]) public dailyTopTurns;

    // ==================== Events ====================
    event PackOpened(address indexed player, uint256[] cardIds);
    event DeckSaved(address indexed player);
    event MatchStarted(uint256 indexed matchId, address indexed player, uint8 mode);
    event MatchJoined(uint256 indexed matchId, address indexed player);
    event WaveStarted(uint256 indexed matchId, uint256 wave);
    event Log(uint256 indexed matchId, address indexed actor, string text);
    event MatchEnded(uint256 indexed matchId, address indexed winner, uint8 mode);

    // ==================== Modifiers ====================
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ==================== Constructor ====================
    constructor() {
        owner = msg.sender;
        cards.push(Card(0, "", 0, 0, 0, 0)); // index 0 占位，cardId == arrayIndex
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

    // ==================== Match 创建 ====================

    /// Solo: 单人对链上 AI（需要已拥有卡组）
    function startSoloMatch(uint256[10] calldata deck) external returns (uint256) {
        require(deckValid(msg.sender, deck), "invalid deck");
        uint256 mid = _createMatch(deck, MODE_SOLO, _freshSeed());
        _setupBot(matches[mid], 10);
        emit MatchStarted(mid, msg.sender, MODE_SOLO);
        return mid;
    }

    /// Quick: 随机卡组免组牌即玩（无需收藏）
    function startQuickMatch() external returns (uint256) {
        uint256 seed = _freshSeed();
        uint256[10] memory quick = _pickCards(seed, 10);
        uint256 mid = _createMatch(quick, MODE_QUICK, seed);
        _setupBot(matches[mid], 10);
        emit MatchStarted(mid, msg.sender, MODE_QUICK);
        return mid;
    }

    /// Daily: 全服同一 Bot（当日种子），最快回合上榜
    function startDailyMatch(uint256[10] calldata deck) external returns (uint256) {
        require(deckValid(msg.sender, deck), "invalid deck");
        uint256 day = block.timestamp / 86400;
        uint256 seed = uint256(keccak256(abi.encodePacked(day)));
        uint256 mid = _createMatch(deck, MODE_DAILY, seed);
        Match storage m = matches[mid];
        m.dailyDay = day;
        _setupBot(m, 10);
        emit MatchStarted(mid, msg.sender, MODE_DAILY);
        return mid;
    }

    /// Endless: 波次递增，每波 Bot 更强，记录最高波
    function startEndlessMatch(uint256[10] calldata deck) external returns (uint256) {
        require(deckValid(msg.sender, deck), "invalid deck");
        uint256 mid = _createMatch(deck, MODE_ENDLESS, _freshSeed());
        Match storage m = matches[mid];
        m.wave = 1;
        _setupBot(m, _endlessMaxCost(1));
        emit MatchStarted(mid, msg.sender, MODE_ENDLESS);
        return mid;
    }

    /// PvP: 创建匹配（等待对手加入）
    function createPvPMatch(uint256[10] calldata deck) external returns (uint256) {
        require(deckValid(msg.sender, deck), "invalid deck");
        uint256 mid = _createMatch(deck, MODE_PVP, _freshSeed());
        matches[mid].phase = 0; // waiting
        emit MatchStarted(mid, msg.sender, MODE_PVP);
        return mid;
    }

    /// PvP: 加入匹配（发起者先手）
    function joinPvPMatch(uint256 matchId, uint256[10] calldata deck) external {
        require(deckValid(msg.sender, deck), "invalid deck");
        Match storage m = matches[matchId];
        require(m.mode == MODE_PVP && m.phase == 0, "not joinable");
        require(msg.sender != m.playerAddr[0], "cannot join own match");
        _setupPlayer(m, 1, deck, _rng(m.seed, 7));
        m.playerAddr[1] = msg.sender;
        m.phase = 1;
        m.turn = 0; // 创建者先手
        emit MatchJoined(matchId, msg.sender);
    }

    /// PvP: 取消未开始的匹配
    function cancelPvPMatch(uint256 matchId) external {
        Match storage m = matches[matchId];
        require(m.mode == MODE_PVP && m.phase == 0, "not cancellable");
        require(msg.sender == m.playerAddr[0], "creator only");
        m.phase = 2;
        emit MatchEnded(matchId, m.playerAddr[1], MODE_PVP);
    }

    // ==================== 核心对战 ====================

    /// 打出随从 (handIdx 0-4)
    function playCard(uint256 matchId, uint256 handIdx) external {
        Match storage m = matches[matchId];
        require(m.phase == 1 && msg.sender == m.playerAddr[m.turn], "not your turn");
        PlayerState storage p = m.players[m.turn];
        require(handIdx < HAND_SIZE && p.hand[handIdx] != 0, "empty hand slot");
        Card storage c = cards[p.hand[handIdx]];
        require(c.cost <= p.mana, "not enough mana");
        require(_boardCount(p) < BOARD_SIZE, "board full");
        p.mana -= c.cost;
        p.hand[handIdx] = 0;
        _placeMinion(p, c.id, false);
        emit Log(matchId, msg.sender, string.concat(_cardName(c.id), " summoned by ", _who(m.turn)));
    }

    /// 随从攻击。targetType: 0=敌方随从, 1=敌方英雄
    function attack(uint256 matchId, uint256 attackerIdx, uint8 targetType, uint256 targetIdx) external {
        Match storage m = matches[matchId];
        require(m.phase == 1 && msg.sender == m.playerAddr[m.turn], "not your turn");
        PlayerState storage p = m.players[m.turn];
        require(attackerIdx < BOARD_SIZE && p.board[attackerIdx].cardId != 0, "bad attacker");
        Minion storage atk = p.board[attackerIdx];
        require(atk.canAct, "minion already acted");
        uint256 enemyIdx = m.turn == 0 ? 1 : 0;
        PlayerState storage e = m.players[enemyIdx];

        if (targetType == 1) {
            uint256 dmg = atk.atk;
            e.heroHp = e.heroHp > dmg ? e.heroHp - dmg : 0;
            atk.canAct = false;
            emit Log(matchId, msg.sender, string.concat(_cardName(atk.cardId), " hits hero for ", _uint2str(dmg)));
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
                emit Log(matchId, msg.sender, "enemy minion destroyed");
            }
            if (atk.hp == 0) {
                atk.cardId = 0;
                emit Log(matchId, msg.sender, "your minion destroyed");
            }
        }
    }

    /// 结束回合：PvP 换手；其他模式 Bot 自动行动后回到玩家
    function endTurn(uint256 matchId) external {
        Match storage m = matches[matchId];
        require(m.phase == 1 && msg.sender == m.playerAddr[m.turn], "not your turn");

        if (m.mode == MODE_PVP) {
            m.turn = m.turn == 0 ? 1 : 0;
            _startTurn(m, m.turn);
            emit Log(matchId, msg.sender, "turn ended");
            return;
        }

        // --- Bot 回合（solo/endless/daily/quick）---
        _startTurn(m, 1); // bot 抽牌 + mana + 解除失调
        PlayerState storage bot = m.players[1];
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
                    emit Log(matchId, BOT, "your minion destroyed");
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
        // --- 玩家回合 ---
        m.turn = 0;
        _startTurn(m, 0);
    }

    // ==================== 读取 ====================
    function getMatch(uint256 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getCard(uint256 id) external view returns (Card memory) {
        return cards[id];
    }

    function cardCount() external view returns (uint256) {
        return cards.length - 1;
    }

    function getBestWave(address player) external view returns (uint256) {
        return bestWave[player];
    }

    function getDailyLeaderboard(uint256 day) external view returns (address[5] memory players, uint256[5] memory turns) {
        for (uint256 i = 0; i < 5; i++) {
            players[i] = dailyTopPlayers[day][i];
            turns[i] = dailyTopTurns[day][i];
        }
    }

    function currentDay() external view returns (uint256) {
        return block.timestamp / 86400;
    }

    // ==================== Owner ====================
    function withdrawFees() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    // ==================== 内部 ====================

    function _freshSeed() internal view returns (uint256) {
        return uint256(keccak256(abi.encode(block.prevrandao, block.timestamp, matchCounter, msg.sender, packNonce)));
    }

    function _rng(uint256 seed, uint256 salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, salt)));
    }

    /// 创建匹配并初始化发起者 (players[0])
    function _createMatch(uint256[10] memory deck, uint8 mode, uint256 seed) internal returns (uint256) {
        matchCounter++;
        Match storage m = matches[matchCounter];
        m.id = matchCounter;
        m.mode = mode;
        m.phase = 1;
        m.seed = seed;
        m.playerAddr[0] = msg.sender;
        _setupPlayer(m, 0, deck, _rng(seed, 1));
        return matchCounter;
    }

    function _setupPlayer(Match storage m, uint256 idx, uint256[10] memory deck, uint256 shuffleSeed) internal {
        PlayerState storage p = m.players[idx];
        _clearBoard(p);
        _clearHand(p);
        uint256[10] memory d = _shuffle(deck, shuffleSeed);
        _copyDeck(p.deck, d);
        p.deckIdx = 0;
        p.heroHp = HERO_HP;
        p.maxMana = 1;
        p.mana = 1;
        _draw(m, idx);
        _draw(m, idx);
        _draw(m, idx);
    }

    /// Bot 初始化：按 maxCost 从卡池选 10 张，heroHp 依波次
    function _setupBot(Match storage m, uint256 maxCost) internal {
        m.playerAddr[1] = BOT;
        PlayerState storage bot = m.players[1];
        _clearBoard(bot);
        _clearHand(bot);
        uint256[10] memory d = _pickCards(_rng(m.seed, 2 + m.wave), maxCost);
        d = _shuffle(d, _rng(m.seed, 3 + m.wave));
        _copyDeck(bot.deck, d);
        bot.deckIdx = 0;
        bot.heroHp = HERO_HP + (m.wave > 1 ? (m.wave - 1) * 2 : 0); // endless 波次增强
        if (bot.heroHp > 50) bot.heroHp = 50;
        bot.maxMana = 1;
        bot.mana = 1;
        _draw(m, 1);
        _draw(m, 1);
        _draw(m, 1);
    }

    /// 新回合开始：解除召唤失调 + 抽牌 + 法力+1
    function _startTurn(Match storage m, uint256 idx) internal {
        PlayerState storage p = m.players[idx];
        _refreshBoard(p);
        _draw(m, idx);
        p.maxMana = p.maxMana >= MAX_MANA ? MAX_MANA : p.maxMana + 1;
        p.mana = p.maxMana;
        m.turnCount++;
    }

    /// 从卡池随机选 n 张（按 maxCost 过滤），洗牌取前 n
    function _pickCards(uint256 seed, uint256 maxCost) internal view returns (uint256[10] memory d) {
        uint256[30] memory pool;
        uint256 n = 0;
        for (uint256 i = 1; i < cards.length; i++) {
            if (cards[i].cost <= maxCost) {
                pool[n] = i;
                n++;
            }
        }
        require(n >= DECK_SIZE, "pool too small");
        // Fisher-Yates
        for (uint256 i = n - 1; i > 0; i--) {
            uint256 j = _rng(seed, i) % (i + 1);
            (pool[i], pool[j]) = (pool[j], pool[i]);
        }
        for (uint256 i = 0; i < DECK_SIZE; i++) d[i] = pool[i];
    }

    function _endlessMaxCost(uint256 wave) internal pure returns (uint256) {
        uint256 mc = 4 + wave / 2; // wave1=4, wave3=5, wave5=6 ... wave12+=10
        return mc > 10 ? 10 : mc;
    }

    /// 对局结束 / 无尽波次推进
    function _endMatch(Match storage m, address winner) internal {
        if (m.mode == MODE_ENDLESS && winner == m.playerAddr[0]) {
            // 玩家赢下当前波 → 下一波
            m.wave++;
            _setupBot(m, _endlessMaxCost(m.wave));
            PlayerState storage p = m.players[0];
            _clearBoard(p);
            _clearHand(p);
            p.deckIdx = 0;
            p.maxMana = 1;
            p.mana = 1;
            p.heroHp = p.heroHp + 5 > HERO_HP ? HERO_HP : p.heroHp + 5;
            _draw(m, 0);
            _draw(m, 0);
            _draw(m, 0);
            m.phase = 1;
            m.turn = 0;
            emit WaveStarted(m.id, m.wave);
            return;
        }
        m.phase = 2;
        m.winner = winner;
        if (m.mode == MODE_ENDLESS) {
            uint256 w = m.wave;
            if (w > bestWave[m.playerAddr[0]]) bestWave[m.playerAddr[0]] = w;
        }
        if (m.mode == MODE_DAILY && winner == m.playerAddr[0]) {
            _recordDaily(m.dailyDay, m.playerAddr[0], m.turnCount);
        }
        emit MatchEnded(m.id, winner, m.mode);
    }

    /// 每日排行榜插入（按回合数升序，top 5）
    function _recordDaily(uint256 day, address player, uint256 turns) internal {
        uint256[5] storage tArr = dailyTopTurns[day];
        address[5] storage pArr = dailyTopPlayers[day];
        for (uint256 i = 0; i < 5; i++) {
            if (pArr[i] == player) {
                if (turns < tArr[i]) tArr[i] = turns;
                return;
            }
            if (tArr[i] == 0 || turns < tArr[i]) {
                for (uint256 j = 4; j > i; j--) {
                    pArr[j] = pArr[j - 1];
                    tArr[j] = tArr[j - 1];
                }
                pArr[i] = player;
                tArr[i] = turns;
                return;
            }
        }
    }

    function _shuffle(uint256[10] memory arr, uint256 seed) internal pure returns (uint256[10] memory) {
        for (uint256 i = DECK_SIZE - 1; i > 0; i--) {
            uint256 j = _rng(seed, i) % (i + 1);
            (arr[i], arr[j]) = (arr[j], arr[i]);
        }
        return arr;
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

    function _clearBoard(PlayerState storage p) internal {
        for (uint256 i = 0; i < BOARD_SIZE; i++) {
            p.board[i].cardId = 0;
        }
    }

    function _clearHand(PlayerState storage p) internal {
        for (uint256 i = 0; i < HAND_SIZE; i++) {
            p.hand[i] = 0;
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

    function _who(uint256 idx) internal pure returns (string memory) {
        return idx == 0 ? "you" : "enemy";
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
