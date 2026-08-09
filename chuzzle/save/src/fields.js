/*

  what the 104 settings in a profile.cfg are, and which panel each belongs in.
  names not listed here still show up, under "Everything else", with a label
  worked out from the name.

  the three counter families - current_, best_ and alltime_ - are one table
  rather than forty five rows, since every stat has all three.

*/

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
    {key: "rest", name: "Everything else"},
];

/* note is a plain hint, not a warning - dates are the game's own YYYYDDMM,
   which reads back to front against every other date format on earth */
const known = {
    Name: {panel: "player", label: "Profile name", control: "text"},
    Coins: {panel: "player", label: "Coins"},
    Tips: {panel: "player", label: "Tips"},
    HasTrophyRoom: {panel: "player", label: "Has a trophy room"},
    UnlockedGames: {panel: "player", label: "Unlocked games"},
    SawGames: {panel: "player", label: "Games seen"},
    BrandNew: {panel: "player", label: "Brand new profile"},
    New: {panel: "player", label: "New"},
    FirstGameOver: {panel: "player", label: "First game over"},
    SoundVolume: {panel: "player", label: "Sound volume", control: "volume"},
    MusicVolume: {panel: "player", label: "Music volume", control: "volume"},
    TapAndHold: {panel: "player", label: "Tap and hold"},

    LastDaily: {panel: "dailydo", label: "Last daily-do"},
    LastDailySeed: {panel: "dailydo", label: "Last daily seeds"},
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
    GotTrophy: {panel: "dailydo", label: "Trophies held", note: "one 0 or 1 per trophy"},
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
