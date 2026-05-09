// BEGIN mchatai-web-components: entities.word-dictionary (entities/WordDictionary.js)

/**
 * Lightweight dictionary helper for word-trace games (Squaredle / Bookworm /
 * Letter-Blast / WordHunt clones). Wraps a word list as a Set for O(1)
 * `has()` lookups, and provides a trie-prefix check so app glue can prune
 * impossible paths during real-time tracing (e.g. dim cells whose extension
 * cannot complete any valid word).
 *
 * Caller supplies the word list — keep it bundled inline (a JS array) for
 * offline operation. Aim for 2,000-10,000 common words for puzzle games;
 * full Scrabble TWL is ~180k and overkill for a portrait mini-app.
 *
 * Usage:
 *   import { WordDictionary } from "./web-components/WordDictionary.js";
 *   const dict = new WordDictionary(["DOG","DOGS","DOGE","CAT","CATS",...]);
 *   dict.has("DOG");          // true
 *   dict.isPrefix("DOG");     // true (DOGS, DOGE start with DOG)
 *   dict.findAllOnGrid(grid); // array of every word the grid can spell
 */
export class WordDictionary {
  /** @param {Iterable<string>} words */
  constructor(words = []) {
    this.words = new Set();
    this.prefixes = new Set();
    this.minWordLength = Infinity;
    this.maxWordLength = 0;
    for (const w of words) {
      this.add(w);
    }
  }

  add(word) {
    const upper = String(word).toUpperCase().replace(/[^A-Z]/g, "");
    if (upper.length < 2) return; // sanity
    this.words.add(upper);
    this.minWordLength = Math.min(this.minWordLength, upper.length);
    this.maxWordLength = Math.max(this.maxWordLength, upper.length);
    for (let i = 1; i <= upper.length; i += 1) {
      this.prefixes.add(upper.slice(0, i));
    }
  }

  has(word) {
    return this.words.has(String(word).toUpperCase());
  }

  /** True if any word in the dictionary starts with `prefix`. */
  isPrefix(prefix) {
    return this.prefixes.has(String(prefix).toUpperCase());
  }

  size() {
    return this.words.size;
  }

  /** Enumerate every dictionary word reachable on a WordTraceGrid via a
   *  legal trace (8-direction adjacency, no cell reuse). Returns a Set.
   *  Used for "show all possible words" bonus screens or hint generation. */
  findAllOnGrid(grid) {
    const found = new Set();
    if (!grid || typeof grid.get !== "function") return found;
    const visited = Array.from({ length: grid.rows }, () =>
      Array(grid.cols).fill(false)
    );
    const path = [];

    const dfs = (r, c) => {
      const letter = grid.get(r, c);
      if (!letter) return;
      visited[r][c] = true;
      path.push(letter);
      const word = path.join("");
      if (this.isPrefix(word)) {
        if (word.length >= grid.minLength && this.has(word)) {
          found.add(word);
        }
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            if (grid.adjacency === 4 && dr !== 0 && dc !== 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (!grid.inBounds(nr, nc)) continue;
            if (visited[nr][nc]) continue;
            dfs(nr, nc);
          }
        }
      }
      path.pop();
      visited[r][c] = false;
    };

    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        dfs(r, c);
      }
    }
    return found;
  }
}

/**
 * Minimal common-words list for tests + small mini-apps. Use this as a
 * fallback or for unit-tests; production apps should bundle their own
 * 2000-10000-word list (e.g. Norvig's 10k-most-common, or a Scrabble
 * 3-7-letter subset). Keep ALL CAPS to match the grid normalization.
 */
export const COMMON_WORDS_SAMPLE = [
  "ACE","ACT","ADD","AGE","AGO","AID","AIM","AIR","ALE","ALL","AND","ANT","ANY","APE","APT","ARC","ARE","ARK","ARM","ART","ASH","ASK","ATE","AXE",
  "BAD","BAG","BAN","BAR","BAT","BAY","BED","BEE","BEG","BET","BIG","BIN","BIT","BLT","BOA","BOB","BOG","BOO","BOP","BOW","BOX","BOY","BRA","BUN","BUS","BUT","BUY","BYE",
  "CAB","CAN","CAP","CAR","CAT","CAW","COB","COD","COG","COP","COT","COW","COY","CRY","CUB","CUE","CUP","CUR","CUT",
  "DAD","DAM","DAY","DEN","DEW","DIE","DIG","DIM","DIN","DIP","DOE","DOG","DON","DOT","DRY","DUB","DUE","DUG","DUO","DYE",
  "EAR","EAT","EBB","EEL","EGG","EGO","ELF","ELK","ELM","END","ERA","EVE","EWE","EYE",
  "FAB","FAD","FAN","FAR","FAT","FAX","FAY","FED","FEE","FEW","FIB","FIG","FIN","FIR","FIT","FIX","FLU","FLY","FOE","FOG","FOR","FOX","FRO","FRY","FUN","FUR",
  "GAB","GAG","GAP","GAS","GAY","GEE","GEL","GEM","GET","GIG","GIN","GIT","GOB","GOD","GOO","GOT","GUM","GUN","GUT","GUY","GYM",
  "HAD","HAM","HAS","HAT","HAW","HAY","HEM","HEN","HER","HEW","HEX","HEY","HID","HIM","HIP","HIS","HIT","HOB","HOE","HOG","HOP","HOT","HOW","HUB","HUE","HUG","HUH","HUM","HUT",
  "ICE","ICH","ICK","ICY","ILK","ILL","IMP","INK","INN","ION","IRE","IRK","ITS","IVY",
  "JAB","JAM","JAR","JAW","JAY","JET","JIG","JOB","JOG","JOT","JOY","JUG","JUT",
  "KEG","KEY","KID","KIN","KIT","KOI",
  "LAB","LAD","LAG","LAP","LAW","LAX","LAY","LED","LEE","LEG","LET","LIB","LID","LIE","LIP","LIT","LOB","LOG","LOO","LOP","LOT","LOW","LUG","LYE",
  "MAC","MAD","MAN","MAP","MAR","MAT","MAW","MAX","MAY","MED","MEN","MET","MIB","MID","MIL","MIM","MIX","MOB","MOD","MOM","MOO","MOP","MOW","MUD","MUG","MUM",
  "NAB","NAG","NAP","NAW","NAY","NEB","NEE","NET","NEW","NIB","NIL","NIP","NIT","NIX","NOB","NOD","NOG","NON","NOR","NOT","NOW","NTH","NUB","NUN","NUT",
  "OAF","OAK","OAR","OAT","ODD","ODE","OFF","OFT","OHM","OIL","OLD","ONE","OPT","ORB","ORE","OUR","OUT","OVA","OWE","OWL","OWN",
  "PAD","PAL","PAN","PAR","PAT","PAW","PAY","PEA","PEG","PEN","PEP","PER","PET","PEW","PIE","PIG","PIN","PIT","PLY","POD","POI","POM","POP","POT","POX","PRO","PRY","PUB","PUG","PUN","PUP","PUS","PUT",
  "QUA",
  "RAD","RAG","RAH","RAJ","RAM","RAN","RAP","RAT","RAW","RAY","RED","REF","REP","RES","RET","REV","REX","RIB","RID","RIG","RIM","RIP","ROB","ROC","ROD","ROE","ROT","ROW","RUB","RUE","RUG","RUM","RUN","RUT","RYE",
  "SAC","SAD","SAG","SAP","SAT","SAW","SAY","SEA","SEE","SET","SEW","SEX","SHE","SHH","SHY","SIC","SIN","SIP","SIR","SIS","SIT","SIX","SKI","SKY","SLY","SOB","SOD","SOL","SON","SOP","SOS","SOW","SOY","SPA","SPY","STY","SUB","SUE","SUM","SUN","SUP",
  "TAB","TAD","TAG","TAN","TAP","TAR","TAT","TAU","TAX","TEA","TED","TEE","TEN","THE","THY","TIC","TIE","TIN","TIP","TIT","TOE","TOG","TOM","TON","TOO","TOP","TOR","TOT","TOW","TOY","TRY","TUB","TUG","TWO",
  "UGH","UMP","UNI","URN","USE",
  "VAN","VAT","VEE","VET","VEX","VIA","VIE","VOW","VS",
  "WAD","WAG","WAN","WAR","WAS","WAX","WAY","WEB","WED","WEE","WET","WHO","WHY","WIG","WIN","WIT","WOE","WOK","WON","WOO","WOW","WRY",
  "YAK","YAM","YAP","YAW","YEA","YEN","YEP","YES","YET","YEW","YIN","YIP","YOB","YON","YOU","YOW","YUK","YUM","YUP",
  "ZAG","ZAP","ZED","ZEE","ZEN","ZIG","ZIP","ZIT","ZOO",
  // Common 4-letter words (sampling — bundle 2-10k for production)
  "ABLE","ACID","AGED","ALSO","AREA","ARMY","AWAY","BABY","BACK","BALL","BAND","BANK","BASE","BATH","BEAR","BEAT","BEEN","BEER","BELL","BELT","BEST","BIKE","BILL","BIRD","BLOW","BLUE","BOAT","BODY","BOMB","BOND","BONE","BOOK","BOOM","BORN","BOSS","BOTH","BOWL","BULK","BURN","BUSH","BUSY","CALL","CALM","CAME","CAMP","CARD","CARE","CASE","CASH","CAST","CELL","CHAT","CHEW","CHIP","CITY","CLUB","COAL","COAT","CODE","COIN","COLD","COME","COOK","COOL","COPE","COPY","CORE","COST","CREW","CROP","DARK","DATA","DATE","DAWN","DAYS","DEAD","DEAL","DEAR","DEBT","DEEP","DENY","DESK","DIAL","DICE","DIET","DISH","DISK","DOES","DONE","DOOR","DOSE","DOWN","DRAW","DREW","DROP","DREW","DRUG","DUAL","DUKE","DUST","DUTY","EACH","EARN","EASE","EAST","EASY","EDGE","ELSE","EVEN","EVER","EVIL","EXIT","FACE","FACT","FAIL","FAIR","FALL","FARM","FAST","FATE","FEAR","FEED","FEEL","FELL","FELT","FILE","FILL","FILM","FIND","FINE","FIRE","FIRM","FISH","FIST","FIVE","FLAT","FLOW","FOOD","FOOT","FORD","FORM","FORT","FOUR","FREE","FROM","FUEL","FULL","FUND","GAIN","GAME","GATE","GAVE","GEAR","GENE","GIFT","GIRL","GIVE","GLAD","GLEN","GOAL","GOES","GOLD","GOLF","GONE","GOOD","GRAB","GRAY","GREW","GREY","GRIP","GROW","GULF","HAIR","HALF","HALL","HAND","HANG","HARD","HARM","HATE","HAVE","HEAD","HEAR","HEAT","HELD","HELL","HELP","HERE","HERO","HIGH","HILL","HINT","HIRE","HOLD","HOLE","HOLY","HOME","HOOK","HOPE","HOST","HOUR","HUGE","HUNG","HUNT","HURT","IDEA","INCH","INTO","IRON","ITEM","JACK","JANE","JEAN","JEEP","JERK","JOHN","JOIN","JOKE","JUMP","JUNE","JURY","JUST","KEEN","KEEP","KENT","KEPT","KICK","KILL","KIND","KING","KISS","KNEE","KNEW","KNOT","KNOW","LACK","LADY","LAID","LAKE","LAND","LANE","LAST","LATE","LEAD","LEAF","LEAN","LEFT","LEGS","LENS","LESS","LIAR","LICE","LIFE","LIFT","LIKE","LIMB","LINE","LINK","LION","LIPS","LIST","LIVE","LOAD","LOAN","LOCK","LOGO","LONG","LOOK","LORD","LOSE","LOSS","LOST","LOUD","LOVE","LUCK","MADE","MAIL","MAIN","MAKE","MALE","MANY","MARK","MARS","MARY","MASK","MASS","MATE","MEAL","MEAN","MEAT","MEET","MELT","MENU","MERE","MILE","MILK","MILL","MIND","MINE","MISS","MODE","MOON","MORE","MOST","MOVE","MUCH","MUST","NAME","NAVY","NEAR","NECK","NEED","NEWS","NEXT","NICE","NICK","NINE","NODE","NONE","NOON","NORM","NOSE","NOTE","OBEY","ODDS","OFFS","OKAY","ONCE","ONES","ONLY","ONTO","OPEN","ORAL","OURS","OVAL","OVEN","OVER","PACE","PACK","PAGE","PAID","PAIN","PAIR","PALE","PALM","PARK","PART","PASS","PAST","PATH","PEAK","PEAR","PICK","PILE","PINE","PINK","PIPE","PLAN","PLAY","PLOT","PLUG","PLUS","POEM","POET","POLE","POLL","POND","POOL","POOR","PORK","PORT","POST","POUR","POSE","PRAY","PREY","PRIM","PROP","PULL","PURE","PUSH","QUIT","RACE","RACK","RAIL","RAIN","RAKE","RANK","RARE","RASH","RATE","READ","REAL","REAR","REIN","RELY","RENT","REST","RICE","RICH","RIDE","RIDS","RING","RISE","RISK","ROAD","ROCK","ROLE","ROLL","ROOF","ROOM","ROOT","ROPE","ROSE","RUBY","RUDE","RULE","RUSH","RUST","SAFE","SAID","SAKE","SALE","SALT","SAME","SAND","SANG","SANK","SAVE","SCAN","SEAL","SEAT","SEED","SEEK","SEEM","SEEN","SELF","SELL","SEMI","SEND","SENT","SHED","SHIP","SHOE","SHOP","SHOT","SHOW","SHUT","SICK","SIDE","SIGN","SILK","SING","SINK","SITE","SIZE","SKIN","SLAM","SLAP","SLED","SLID","SLIM","SLOT","SLOW","SNAP","SNOW","SOAP","SOCK","SOFA","SOFT","SOIL","SOLD","SOLE","SOLO","SOME","SONG","SOON","SORT","SOUL","SPAN","STAR","STAY","STEM","STEP","STOP","SUCH","SUIT","SUNK","SURE","SWAM","SWIM","TACK","TAIL","TAKE","TALE","TALK","TALL","TANK","TAPE","TASK","TAXI","TEAM","TEAR","TELL","TEND","TENS","TENT","TERM","TEST","THAN","THAT","THEM","THEN","THEY","THIN","THIS","THUD","THUS","TIED","TIES","TILE","TILL","TIME","TINY","TIPS","TIRE","TOAD","TODD","TOLD","TOLL","TONE","TOOK","TOOL","TORN","TOUR","TOWN","TRAY","TREE","TRIM","TRIO","TRIP","TRUE","TUBE","TUNA","TUNE","TURN","TWIN","TYPE","UGLY","UNDO","UNIT","UPON","URGE","USED","USER","USES","VAIN","VARY","VAST","VERB","VERY","VICE","VIEW","VINE","VOID","VOTE","WAGE","WAIT","WAKE","WALK","WALL","WANT","WARD","WARE","WARM","WARN","WARS","WASH","WAVE","WEAK","WEAR","WEEK","WELL","WENT","WERE","WEST","WHAT","WHEN","WHIP","WHOM","WIDE","WIFE","WILD","WILL","WIND","WINE","WING","WIRE","WISE","WISH","WITH","WOLF","WOOD","WORD","WORE","WORK","WORN","YARD","YEAH","YEAR","YOUR","ZERO","ZONE",
  // Common 5-7 letter samples (representative — caller should bundle ~5k for real game)
  "ABOUT","ABOVE","ABUSE","ACTOR","ACUTE","ADAPT","ADMIT","ADOPT","ADULT","AFTER","AGAIN","AGENT","AGREE","AHEAD","ALARM","ALBUM","ALERT","ALIKE","ALIVE","ALLOW","ALONE","ALONG","ALTER","AMONG","ANGEL","ANGER","ANGLE","ANGRY","APART","APPLE","APPLY","ARENA","ARGUE","ARISE","ARRAY","ASIDE","ASSET","AVOID","AWARE","AWFUL","BADGE","BAKER","BASIC","BASIL","BASIN","BATCH","BEACH","BEGAN","BEGIN","BEGUN","BEING","BELOW","BENCH","BIRTH","BLACK","BLADE","BLAME","BLANK","BLAST","BLAZE","BLEED","BLEND","BLESS","BLIND","BLOCK","BLOOD","BLOOM","BLOWN","BLUSH","BOARD","BOAST","BOOST","BOOTH","BOUND","BRAIN","BRAKE","BRAND","BRASS","BRAVE","BREAD","BREAK","BREED","BRIEF","BRING","BROAD","BROKE","BROWN","BUILD","BUILT","BUNCH","BURST","BUYER","CABIN","CABLE","CACHE","CADET","CAKED","CALLS","CAMEL","CAMPS","CANAL","CANDY","CARGO","CARRY","CARVE","CATCH","CAUSE","CHAIN","CHAIR","CHALK","CHAMP","CHART","CHASE","CHEAP","CHEAT","CHECK","CHEEK","CHEER","CHESS","CHEST","CHIEF","CHILD","CHILE","CHILL","CHINA","CHOIR","CHOSE","CHUNK","CIVIC","CIVIL","CLAIM","CLAMP","CLAPS","CLASH","CLASP","CLASS","CLAWS","CLEAN","CLEAR","CLERK","CLIFF","CLIMB","CLING","CLOCK","CLONE","CLOSE","CLOTH","CLOUD","CLOWN","CLUMP","COACH","COAST","COCOA","COLON","COLOR","COMET","COMMA","CORAL","COULD","COUNT","COURT","COVER","CRAFT","CRANE","CRASH","CRAZY","CREAM","CRIED","CRIES","CRIME","CRISP","CROOK","CROSS","CROWD","CROWN","CRUDE","CRUEL","CRUSH","CRUST","CURSE","CURVE","CYCLE","DAILY","DAIRY","DAISY","DANCE","DEALT","DEATH","DEBUT","DELAY","DEPTH","DERBY","DETER","DEVIL","DIARY","DIRTY","DITCH","DOZEN","DRAFT","DRAIN","DRAMA","DRANK","DRESS","DRIED","DRIES","DRILL","DRINK","DRIVE","DROVE","DROWN","DRUNK","DRYER","DUCKS","DUSTY","DWELL","DYING","EAGER","EAGLE","EARLY","EARTH","EIGHT","ELBOW","ELDER","ELECT","ELFIN","EMPTY","ENEMY","ENJOY","ENTER","ENTRY","EQUAL","ERASE","ERROR","ESSAY","EVENT","EVERY","EXACT","EXIST","EXTRA","FAINT","FAITH","FALSE","FANCY","FARMS","FATAL","FAULT","FAVOR","FEAST","FENCE","FIELD","FIERY","FIFTY","FIGHT","FINAL","FIRES","FIRST","FIXED","FLAIR","FLAME","FLASH","FLEET","FLESH","FLEW","FLINT","FLOAT","FLOCK","FLOOD","FLOOR","FLOUR","FLUSH","FOCAL","FORCE","FORTH","FORTY","FORUM","FOUND","FRAME","FRAUD","FRESH","FRIED","FROCK","FROST","FROWN","FROZE","FRUIT","FUDGE","FULLY","FUNNY","GAINS","GAUGE","GIANT","GLAND","GLARE","GLASS","GLEAM","GLIDE","GLOBE","GLOOM","GLORY","GLOVE","GRACE","GRADE","GRAIN","GRAND","GRANT","GRAPE","GRAPH","GRASP","GRASS","GRATE","GRAVE","GRAVY","GRAZE","GREAT","GREED","GREEN","GREET","GRIEF","GRILL","GRIND","GROIN","GROOM","GROSS","GROUP","GROVE","GROWN","GUARD","GUESS","GUEST","GUIDE","GUILD","GUILT","HABIT","HAPPY","HARSH","HATCH","HAUNT","HEART","HEAVY","HEDGE","HENCE","HOIST","HOLDS","HOLLY","HONEY","HONOR","HORSE","HOTEL","HOUSE","HOVER","HUMAN","HUMID","IDEAL","IMAGE","IMPLY","INDEX","INFER","INNER","INPUT","ISSUE","IVORY","JEANS","JELLY","JEWEL","JOINT","JOKER","JOLLY","JUDGE","JUICE","JUICY","JUMPS","KARMA","KETO","KICKS","KINDS","KNEEL","KNELT","KNIFE","KNOCK","KNOWN","LABEL","LARGE","LASER","LATER","LAUGH","LAYER","LEARN","LEASE","LEAST","LEAVE","LEGAL","LEMON","LEVER","LIGHT","LIKED","LIKES","LIMIT","LINEN","LINEN","LIVER","LOBBY","LOCAL","LODGE","LOGIC","LOGOS","LOOSE","LOWER","LOYAL","LUCKY","LUMPY","LUNAR","LUNCH","LYING","MAGIC","MAJOR","MAKER","MAMMA","MANGE","MANGO","MANIC","MANOR","MAPLE","MARCH","MARSH","MATCH","MAYBE","MAYOR","MEANT","MEDAL","MEDIA","MELON","MERGE","MERIT","MERRY","METAL","METRO","MIGHT","MINOR","MINUS","MIXED","MODEL","MODEM","MOIST","MONEY","MONTH","MORAL","MORPH","MOTOR","MOUNT","MOUSE","MOUTH","MOVED","MOVES","MOVIE","MUSIC","NAIVE","NASTY","NEEDS","NEIGH","NEVER","NEWLY","NIGHT","NINTH","NOBLE","NOISE","NORTH","NOTED","NOTES","NOVEL","NURSE","NYMPH","OASIS","OCCUR","OCEAN","OFFER","OFTEN","OLDER","OLIVE","ONCE","ONION","OPERA","ORDER","ORGAN","OTHER","OUNCE","OUTDO","OUTER","OVERT","OWING","OWNED","OWNER","PADDY","PAINT","PAPER","PARTS","PARTY","PASTA","PASTE","PATCH","PATHS","PAUSE","PEACE","PEACH","PEARL","PENNY","PHASE","PHONE","PHOTO","PIANO","PIECE","PILOT","PINCH","PIVOT","PIZZA","PLACE","PLAIN","PLANE","PLANK","PLANT","PLATE","PLAYS","PLEAD","POEMS","POETS","POINT","POSIT","POUND","POWER","PRESS","PRICE","PRIDE","PRINT","PRIOR","PROSE","PROUD","PROVE","PROXY","PRUNE","PSALM","PUNCH","PURSE","QUART","QUASH","QUEEN","QUEST","QUICK","QUIET","QUILT","QUITE","QUOTE","RADAR","RADIO","RAIDS","RAINS","RAISE","RALLY","RAMEN","RANCH","RANGE","RAPID","RATES","RATIO","RAVEN","REACH","REACT","READY","REALM","REBEL","RECAP","REFER","REIGN","RELAX","RELAY","RELIC","REMIT","REPLY","RIGHT","RIGID","RINSE","RIPEN","RIVAL","RIVER","ROAST","ROBIN","ROBOT","ROCKS","ROCKY","ROGUE","ROLES","ROOM","ROUGH","ROUND","ROUTE","ROYAL","RUGBY","RULER","RURAL","SADLY","SAFER","SAINT","SALAD","SALES","SALTY","SANDY","SAUCE","SAUNA","SCALE","SCALP","SCAMP","SCARE","SCARS","SCENE","SCENT","SCOLD","SCOOP","SCORE","SCORN","SCOUT","SCREW","SEDAN","SEEDS","SEEKS","SEEMS","SENSE","SERVE","SETUP","SEVEN","SEVER","SHACK","SHADE","SHAFT","SHAKE","SHAKY","SHALL","SHAME","SHAPE","SHARD","SHARE","SHARK","SHARP","SHEAR","SHEEN","SHEEP","SHEER","SHEET","SHELF","SHELL","SHIED","SHIFT","SHINE","SHIRT","SHOCK","SHOES","SHONE","SHORE","SHORT","SHOUT","SHOVE","SHOWN","SHRED","SHRUG","SIGHT","SIGMA","SILLY","SINCE","SIREN","SIXTH","SIXTY","SIZED","SKATE","SKILL","SKIRT","SKULL","SLACK","SLAIN","SLATE","SLAVE","SLEEK","SLEEP","SLEET","SLICE","SLIDE","SLIME","SLING","SLOPE","SLOTH","SMACK","SMALL","SMART","SMASH","SMELL","SMELT","SMILE","SMITH","SMOKE","SMOKY","SNACK","SNAIL","SNAKE","SNARE","SNEAK","SNIFF","SNOOP","SNORE","SOAPY","SOBER","SOLAR","SOLID","SOLVE","SONIC","SORRY","SORTS","SOUND","SOUTH","SPACE","SPADE","SPARE","SPARK","SPEAK","SPEAR","SPECK","SPEED","SPELL","SPEND","SPENT","SPICE","SPICY","SPIED","SPIES","SPIKE","SPILL","SPINE","SPLIT","SPOIL","SPOKE","SPOOL","SPOON","SPORT","SPRAY","SPREE","SPRIG","SQUAD","STACK","STAFF","STAGE","STAIN","STAIR","STAKE","STALE","STALK","STALL","STAMP","STAND","STARE","START","STARS","STATE","STAYS","STEAK","STEAL","STEEL","STEEP","STEER","STERN","STICK","STIFF","STILE","STILL","STING","STINK","STIRS","STOCK","STOLE","STONE","STOOD","STOOL","STOOP","STORE","STORK","STORM","STORY","STOVE","STRAW","STRAY","STREW","STRIP","STROW","STUCK","STUDY","STUFF","STUMP","STUNG","STUNK","STUNT","STYLE","SUGAR","SUITE","SULKY","SUNNY","SUPER","SURGE","SWAIN","SWARM","SWEAR","SWEAT","SWEEP","SWEET","SWELL","SWEPT","SWIFT","SWILL","SWING","SWIRL","SWORE","SWORN","TABLE","TAKEN","TAKES","TALLY","TAPED","TARRY","TASTE","TASTY","TAXIS","TEACH","TEAMS","TEARS","TEASE","TEMPO","TENTH","TERMS","TESTS","THANK","THEFT","THEIR","THEME","THERE","THESE","THICK","THIEF","THING","THINK","THIRD","THONG","THORN","THOSE","THREE","THREW","THROW","THUMB","THUMP","TIDAL","TIGER","TIGHT","TILES","TIMER","TIMES","TIRED","TITLE","TODAY","TONAL","TONIC","TOOTH","TOPAZ","TOPIC","TOTAL","TOUCH","TOUGH","TOWER","TOXIC","TRACE","TRACK","TRACT","TRADE","TRAIL","TRAIN","TRAIT","TRAMP","TRAPS","TRASH","TREAT","TREES","TREND","TRIAL","TRIBE","TRICE","TRICK","TRIED","TRIES","TRIPE","TROOP","TROUT","TROVE","TRUCE","TRUCK","TRULY","TRUMP","TRUNK","TRUST","TRUTH","TUDOR","TULIP","TUNES","TURBO","TWICE","TWIST","TWIXT","TYRES","UDDER","ULCER","UNDER","UNDID","UNDUE","UNION","UNITY","UNTIL","UPPER","UPSET","URBAN","URINE","USAGE","USING","USUAL","UTTER","VAGUE","VALID","VALOR","VALUE","VAULT","VENOM","VENUE","VERSE","VIDEO","VIEWS","VIGIL","VINYL","VIOLA","VIRUS","VITAL","VIVID","VOCAL","VODKA","VOICE","VOTED","VOTES","VOUCH","WAGES","WAIST","WAITS","WAIVE","WAKES","WANNA","WAFFLE","WANED","WANES","WAVED","WAVES","WAYS","WEARS","WEARY","WEAVE","WEDGE","WEEDS","WEEPS","WHALE","WHARF","WHEAT","WHEEL","WHELP","WHENS","WHERE","WHICH","WHIFF","WHILE","WHINE","WHIPS","WHIRL","WHITE","WHOLE","WHOOP","WHOSE","WIDOW","WIELD","WILDS","WIMPY","WINCE","WINCH","WINDS","WIPED","WIPES","WIRED","WISER","WIVES","WOKEN","WOMAN","WOMEN","WOODY","WOOLY","WORDS","WORLD","WORMS","WORRY","WORSE","WORST","WORTH","WOULD","WOVEN","WRACK","WRACK","WRECK","WREN","WRING","WRIST","WRITE","WRONG","WROTE","WRUNG","WRYLY","YACHT","YEAST","YIELD","YOUNG","YOUTH","ZEBRA","ZESTY","ZOOMS"
];
// END mchatai-web-components: entities.word-dictionary
