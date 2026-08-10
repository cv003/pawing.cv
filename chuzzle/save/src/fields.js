/*

  what the 104 settings in a profile.cfg are, and which panel each belongs in.
  names not listed here still show up, under "Other", with a label
  worked out from the name.

  the three counter families - current_, best_ and alltime_ - are one table
  rather than forty five rows, since every stat has all three.

*/

/* all forty Trophy Room entries, name and description, pulled straight out of
   the binary's own data - not the server. TrophyRoom::ShowInfo indexes a
   packed {name, desc} pointer table via _TT(); the pointers are filled in at
   load time by R_AARCH64_RELATIVE relocations (this is a PIE .so, so
   .data.rel.ro is zeroed on disk), so reading it needed the relocation table,
   not just the string dump. #25 is blank in the binary itself - never
   assigned a trophy, not a reading error. see datainfo/README.md. */
const trophydata = [
    {name: "SEVEN AT ONCE", desc: "For popping seven Chuzzles in a single color group"},
    {name: "EIGHT AT ONCE", desc: "For popping eight Chuzzles in a single color group"},
    {name: "TOO MANY AT ONCE", desc: "For popping more than eight Chuzzles in a single color group"},
    {name: "CHUZZLE BINGO", desc: "For simultaneously popping Chuzzles all the way across the board"},
    {name: "ULTRA BINGO", desc: "For popping a single color group all the way across the board"},
    {name: "JAILBREAKER", desc: "For breaking three or more locks at one time"},
    {name: "TRIPLE COMBO", desc: "For popping three groups of Chuzzles at once"},
    {name: "QUAD COMBO", desc: "For popping four groups of Chuzzles at once"},
    {name: "MAD BOMBER", desc: "For Exploding 5 super Chuzzles in one chain reaction"},
    {name: "MASTER BLASTER", desc: "For Exploding 8 super Chuzzles in one chain reaction"},
    {name: "REACTOR", desc: "For causing a six step match cascade"},
    {name: "SHOOT THE MOON", desc: "For matching 14 Chuzzles (any color) at one time"},
    {name: "TEN GRAND", desc: "For popping 10,000 Chuzzles, ever"},
    {name: "HUNDRED GRAND", desc: "For popping 100,000 Chuzzles, ever"},
    {name: "MILLION DOLLAR BABY", desc: "For popping 1,000,000 Chuzzles, ever"},
    {name: "CHUZZ BOMBER", desc: "For exploding 10,000 super Chuzzles, ever"},
    {name: "LOCKSMITH", desc: "For breaking out 10,000 locked Chuzzles, ever"},
    {name: "COLOR OF ZEN", desc: "For filling in the entire rainbow in Zen Chuzzle"},
    {name: "FAT BLASTER", desc: "For popping 1,000 fat Chuzzles, ever"},
    {name: "GAME OVER MAN", desc: "For completing 100 full games of any kind"},
    {name: "DREAMY DOZEN", desc: "For reaching level 12 in Classic Chuzzle"},
    {name: "BOTTOMS UP", desc: "For filling 1,000 bottles, anywhere, any time"},
    {name: "BLITZER THAN BLITZ", desc: "<color cyan>Get it in CHUZZLE BLITZ<color white><BR><BR>For filling the bottle in less than half the time"},
    {name: "PRISMATIC FANATIC", desc: "<color cyan>Get it in PRISMATIC CHUZZLE<color white><BR><BR>For blowing up all the rainbows instead of matching them"},
    {name: "", desc: ""},
    {name: "MAXIMUM FUNK", desc: "For funkifying every single cube on the level 2 world"},
    {name: "MAXIMUM FUNK II", desc: "For funkifying every single cube on the level 4 world"},
    {name: "MAXIMUM FUNK III", desc: "For funkifying every single cube on the level 6 world"},
    {name: "MENTALIST", desc: "<color cyan>Get it in CHUZZLE MINDBENDER<color white><BR><BR>For matching the pattern at par or better"},
    {name: "SPEED DEMON", desc: "<color cyan>Get it in SPEED CHUZZLE<color white><BR><BR>For filling the bottle without getting a single lock"},
    {name: "MISTER MYSTERY", desc: "<color cyan>Get it in MYSTERY CHUZZLE<color white><BR><BR>For unmasking two or more mystery Chuzzles in a single move"},
    {name: "LIL DEVIL", desc: "<color cyan>Get it in CHUZZLE DUEL<color white><BR><BR>For dropping FIVE LOCKS on your opponent in under two seconds"},
    {name: "RAPTUROUS", desc: "<color cyan>Get it in CHUZZLE RAPTURE<color white><BR><BR>For completing the rapture with a four Chuzzle group or better"},
    {name: "CHUZZLE IN 5", desc: "<color cyan>Get it in CHUZZLE IN 10<color white><BR><BR>For filling the bottle with more than five moves to spare"},
    {name: "GOTCHA GACHA", desc: "<color cyan>Get it in CHUZZLE SURPRISE<color white><BR><BR>For popping six bubbles in a single color group"},
    {name: "GOLD BRICKER", desc: "<color cyan>Get it in SUNCHUZZLE<color white><BR><BR>For turning two corners gold in a single move"},
    {name: "STUNT DOUBLE", desc: "<color cyan>Get it in STUNT CHUZZLE<color white><BR><BR>For matching two stunt shapes in a single move"},
    {name: "BLAST EM OUT", desc: "<color cyan>Get it in CHUZZLES IN CHAINS<color white><BR><BR>For blowing up at least one of the locks"},
    {name: "IRON CHUZZLE", desc: "For getting all the way to the level 10 world"},
    {name: "DAILY DUDE", desc: "For ranking in the top 100 scores of the Daily-Do!<if #got_daily_dude==0><BR><BR><color cyan>Check YESTERDAY'S scores in Daily-Do to get this trophy!<color white></if>"},
];

const statnames = [
    "mGamesWon", "mHighScore", "mHighestLevelReached", "mBestLevelWinPercent",
    "mChuzzlesPopped", "mFattyChuzzlesPopped", "mLocksBroken",
    "mMostLocksOnscreenAtOnce", "mExplosiveChuzzlesCreated",
    "mExplosiveChuzzlesSploded", "mMostExplosiveOnscreenAtOnce",
    "mBottlesFilled", "mBonusItemsFound", "mCoinsFound", "mGameOvers",
];

const panels = [
    {key: "player", name: "Player"},
    {key: "records", name: "Records"},
    {key: "dailydo", name: "Daily-Do"},
    {key: "puzzles", name: "Puzzles"},
    {key: "runs", name: "Difficulty"},
    {key: "rest", name: "Other"},
];

const known = {
    Name: {panel: "player", label: "Profile name", control: "text"},
    Coins: {panel: "player", label: "Coins"},
    Tips: {panel: "player", label: "Tips", note: "possibly an old value? no longer used"},
    HasTrophyRoom: {panel: "player", label: "Has a trophy room"},
    UnlockedGames: {panel: "player", label: "Unlocked games",
        note: "a bit per game - which bit is which game is unconfirmed, no reader "
            + "of this field was found in the decompile to trace it from"},
    SawGames: {panel: "player", label: "Games seen",
        note: "game ids, same unconfirmed id order as Unlocked games - "
            + "the field name itself has no match anywhere in the decompile either"},
    BrandNew: {panel: "player", label: "Brand new profile"},
    New: {panel: "player", label: "New"},
    FirstGameOver: {panel: "player", label: "First game over"},
    SoundVolume: {panel: "player", label: "Sound volume", control: "volume"},
    MusicVolume: {panel: "player", label: "Music volume", control: "volume"},
    TapAndHold: {panel: "player", label: "Tap and hold"},

    LastDaily: {panel: "dailydo", label: "Last daily-do"},
    LastDailySeed: {panel: "dailydo", label: "Last daily seeds", control: "datelist"},
    AwardedDailyDo: {panel: "dailydo", label: "Awarded on", control: "date"},
    DDAlreadyPlayedVersion: {panel: "dailydo", label: "Played version"},
    DDGotXP: {panel: "dailydo", label: "Last xp day", control: "date"},
    DDXP: {panel: "dailydo", label: "Daily-Do xp"},
    DDLevel: {panel: "dailydo", label: "Daily-Do level"},
    DDStreak: {panel: "dailydo", label: "Streak"},
    DDStreakDay: {panel: "dailydo", label: "Streak day", note: "days, not a date"},
    DDRewards: {panel: "dailydo", label: "Reward ids"},
    DDPrizes: {panel: "dailydo", label: "Prizes taken", control: "namelist", sep: "|"},
    DDPendingPrizes: {panel: "dailydo", label: "Prizes waiting", control: "namelist", sep: ","},
    DDPendingPrizesBeta1: {panel: "dailydo", label: "Prizes waiting (beta)",
        control: "namelist", sep: ","},
    FreeDo: {panel: "dailydo", label: "Free plays"},
    ContinueDailyDo: {panel: "dailydo", label: "Continue day", control: "date"},
    ContinueDailyDoVersion: {panel: "dailydo", label: "Continue version"},
    GoldenOne: {panel: "dailydo", label: "Golden one day", control: "date"},
    GoldenOneCount: {panel: "dailydo", label: "Golden ones won"},
    GoldenTornament: {panel: "dailydo", label: "Golden tournament", note: "spelt that way in the game"},
    LastTourneySeed: {panel: "dailydo", label: "Last tourney seed"},
    GotTrophy: {panel: "dailydo", label: "Trophies held", control: "trophies"},
    GotTrophyTime: {panel: "dailydo", label: "Trophy dates", control: "text",
        note: "quoted, and the quotes hold commas"},
    GotTrophySeed: {panel: "dailydo", label: "Trophy seeds"},

    CurrentPuzzle: {panel: "puzzles", label: "Current puzzle"},
    RemindPuzzlePosters: {panel: "puzzles", label: "Remind about posters"},
    announcedpuzzletoday: {panel: "puzzles", label: "Announced today"},
    BottlesFilled_Zen: {panel: "puzzles", label: "Bottles filled in zen"},
    HighScore_ClassicChuzzle: {panel: "puzzles", label: "Classic high score"},
    HighScore_SpeedChuzzle: {panel: "puzzles", label: "Speed high score"},

    WinCount: {panel: "runs", label: "Wins per level"},
    DifficultyMod: {panel: "runs", label: "Difficulty per level"},
    CarryDifficultyMod: {panel: "runs", label: "Carried difficulty"},
    Bonus: {panel: "runs", label: "Bonus counters"},
    BossBattlesPlayed: {panel: "runs", label: "Boss battles played"},
    LastBossType: {panel: "runs", label: "Last boss types", control: "numlist"},

    LastPlayedState: {panel: "rest", label: "Board in progress", binary: true},
    OpenGL_Driver_Data: {panel: "rest", label: "Driver blob", binary: true},
};

/*//////////////////////////////////////////////////////////////////////*/

// mExplosiveChuzzlesSploded -> Explosive chuzzles sploded
function prettyname(name) {
    const cut = name.replace(/^m(?=[A-Z])/, "").replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return cut.charAt(0).toUpperCase() + cut.slice(1).toLowerCase();
}

function fieldinfo(name) {
    if (known[name]) return known[name];
    const seasonal = /^has_(.+)_puzzle$/.exec(name);
    if (seasonal) {
        return {panel: "puzzles", label: prettyname(seasonal[1]) + " puzzle"};
    }
    return {panel: "rest", label: prettyname(name)};
}

// "20260908" is the game's own year-day-month
function readgamedate(value) {
    const hit = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value).trim());
    if (!hit) return "";
    const day = Number(hit[2]);
    const month = Number(hit[3]);
    if (!day || day > 31 || !month || month > 12) return "";
    const when = new Date(Number(hit[1]), month - 1, day);
    if (when.getDate() !== day) return "";
    return when.toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric"});
}

function valuekind(value) {
    if (value === "true" || value === "false") return "bool";
    if (/^-?\d+$/.test(value)) return "int";
    if (/^-?\d*\.\d+$/.test(value)) return "float";
    if (/^-?\d+(,-?\d+)+$/.test(value)) return "list";
    return "text";
}
