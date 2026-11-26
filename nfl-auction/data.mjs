// Team metadata and roster pools for the NFL Auction Draft game.
// OVR values are this game's own 0-99 estimates, not an official ratings source.
// "current" = 2026 season rosters (researched Nov 2026). "alltime" = franchise legends.
// Compact format per position: [name, ovr] or, for OL/DST units, [unitName, ovr, notablePlayers].

export const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500/";

export const TEAMS = [
  { id: "ARI", espn: "ari", city: "Arizona", name: "Cardinals", conf: "NFC", colors: ["#97233F", "#FFB612"] },
  { id: "ATL", espn: "atl", city: "Atlanta", name: "Falcons", conf: "NFC", colors: ["#A71930", "#000000"] },
  { id: "BAL", espn: "bal", city: "Baltimore", name: "Ravens", conf: "AFC", colors: ["#241773", "#9E7C0C"] },
  { id: "BUF", espn: "buf", city: "Buffalo", name: "Bills", conf: "AFC", colors: ["#00338D", "#C60C30"] },
  { id: "CAR", espn: "car", city: "Carolina", name: "Panthers", conf: "NFC", colors: ["#0085CA", "#101820"] },
  { id: "CHI", espn: "chi", city: "Chicago", name: "Bears", conf: "NFC", colors: ["#0B162A", "#C83803"] },
  { id: "CIN", espn: "cin", city: "Cincinnati", name: "Bengals", conf: "AFC", colors: ["#FB4F14", "#000000"] },
  { id: "CLE", espn: "cle", city: "Cleveland", name: "Browns", conf: "AFC", colors: ["#311D00", "#FF3C00"] },
  { id: "DAL", espn: "dal", city: "Dallas", name: "Cowboys", conf: "NFC", colors: ["#003594", "#869397"] },
  { id: "DEN", espn: "den", city: "Denver", name: "Broncos", conf: "AFC", colors: ["#FB4F14", "#002244"] },
  { id: "DET", espn: "det", city: "Detroit", name: "Lions", conf: "NFC", colors: ["#0076B6", "#B0B7BC"] },
  { id: "GB", espn: "gb", city: "Green Bay", name: "Packers", conf: "NFC", colors: ["#203731", "#FFB612"] },
  { id: "HOU", espn: "hou", city: "Houston", name: "Texans", conf: "AFC", colors: ["#03202F", "#A71930"] },
  { id: "IND", espn: "ind", city: "Indianapolis", name: "Colts", conf: "AFC", colors: ["#002C5F", "#A2AAAD"] },
  { id: "JAX", espn: "jax", city: "Jacksonville", name: "Jaguars", conf: "AFC", colors: ["#006778", "#D7A22A"] },
  { id: "KC", espn: "kc", city: "Kansas City", name: "Chiefs", conf: "AFC", colors: ["#E31837", "#FFB81C"] },
  { id: "LV", espn: "lv", city: "Las Vegas", name: "Raiders", conf: "AFC", colors: ["#000000", "#A5ACAF"] },
  { id: "LAC", espn: "lac", city: "Los Angeles", name: "Chargers", conf: "AFC", colors: ["#0080C6", "#FFC20E"] },
  { id: "LAR", espn: "lar", city: "Los Angeles", name: "Rams", conf: "NFC", colors: ["#003594", "#FFA300"] },
  { id: "MIA", espn: "mia", city: "Miami", name: "Dolphins", conf: "AFC", colors: ["#008E97", "#FC4C02"] },
  { id: "MIN", espn: "min", city: "Minnesota", name: "Vikings", conf: "NFC", colors: ["#4F2683", "#FFC62F"] },
  { id: "NE", espn: "ne", city: "New England", name: "Patriots", conf: "AFC", colors: ["#002244", "#C60C30"] },
  { id: "NO", espn: "no", city: "New Orleans", name: "Saints", conf: "NFC", colors: ["#D3BC8D", "#101820"] },
  { id: "NYG", espn: "nyg", city: "New York", name: "Giants", conf: "NFC", colors: ["#0B2265", "#A71930"] },
  { id: "NYJ", espn: "nyj", city: "New York", name: "Jets", conf: "AFC", colors: ["#125740", "#FFFFFF"] },
  { id: "PHI", espn: "phi", city: "Philadelphia", name: "Eagles", conf: "NFC", colors: ["#004C54", "#A5ACAF"] },
  { id: "PIT", espn: "pit", city: "Pittsburgh", name: "Steelers", conf: "AFC", colors: ["#FFB612", "#101820"] },
  { id: "SF", espn: "sf", city: "San Francisco", name: "49ers", conf: "NFC", colors: ["#AA0000", "#B3995D"] },
  { id: "SEA", espn: "sea", city: "Seattle", name: "Seahawks", conf: "NFC", colors: ["#002244", "#69BE28"] },
  { id: "TB", espn: "tb", city: "Tampa Bay", name: "Buccaneers", conf: "NFC", colors: ["#D50A0A", "#34302B"] },
  { id: "TEN", espn: "ten", city: "Tennessee", name: "Titans", conf: "AFC", colors: ["#0C2340", "#4B92DB"] },
  { id: "WAS", espn: "wsh", city: "Washington", name: "Commanders", conf: "NFC", colors: ["#5A1414", "#FFB612"] }
];

// Current = 2026 season, researched late November 2026 (after the Nov. 10 trade deadline).
// Players out for the season are left off. Where the starting QB job is contested, both are listed.
export const CURRENT = {
  ARI: { QB: [["Gardner Minshew", 72], ["Carson Beck", 68]], RB: [["Jeremiyah Love", 80], ["Tyler Allgeier", 74]], WR: [["Marvin Harrison Jr.", 82], ["Michael Wilson", 76], ["Kendrick Bourne", 72]], TE: [["Trey McBride", 92]], OL: [["Cardinals O-Line", 74, "Paris Johnson Jr. · Jonah Williams"]], K: [["Chad Ryland", 75]], DST: [["Cardinals D/ST", 74, "Budda Baker · Josh Sweat"]] },
  ATL: { QB: [["Michael Penix Jr.", 78], ["Tua Tagovailoa", 76]], RB: [["Bijan Robinson", 96]], WR: [["Drake London", 89], ["Jahan Dotson", 72], ["Olamide Zaccheaus", 70]], TE: [["Kyle Pitts", 80]], OL: [["Falcons O-Line", 82, "Chris Lindstrom · Jake Matthews"]], K: [["Nick Folk", 82]], DST: [["Falcons D/ST", 75, "Jalon Walker · A.J. Terrell"]] },
  BAL: { QB: [["Lamar Jackson", 94]], RB: [["Derrick Henry", 90]], WR: [["Zay Flowers", 86], ["Rashod Bateman", 77], ["Devontez Walker", 70]], TE: [["Mark Andrews", 84]], OL: [["Ravens O-Line", 81, "Ronnie Stanley · Andrew Vorhees"]], K: [["Tyler Loop", 84]], DST: [["Ravens D/ST", 87, "Kyle Hamilton · Trey Hendrickson"]] },
  BUF: { QB: [["Josh Allen", 96]], RB: [["James Cook", 89]], WR: [["DJ Moore", 83], ["Khalil Shakir", 80], ["Keon Coleman", 75]], TE: [["Dalton Kincaid", 80]], OL: [["Bills O-Line", 84, "Dion Dawkins · Spencer Brown"]], K: [["Tyler Bass", 80]], DST: [["Bills D/ST", 82, "Greg Rousseau · Bradley Chubb"]] },
  CAR: { QB: [["Bryce Young", 83]], RB: [["Chuba Hubbard", 77], ["Trevor Etienne", 72]], WR: [["Tetairoa McMillan", 86], ["Jalen Coker", 74], ["Xavier Legette", 72]], TE: [["Tommy Tremble", 70]], OL: [["Panthers O-Line", 80, "Ikem Ekwonu · Taylor Moton"]], K: [["Ryan Fitzgerald", 76]], DST: [["Panthers D/ST", 77, "Derrick Brown · Jaelan Phillips"]] },
  CHI: { QB: [["Caleb Williams", 85]], RB: [["D'Andre Swift", 78]], WR: [["Rome Odunze", 82], ["Luther Burden III", 81], ["Kalif Raymond", 70]], TE: [["Colston Loveland", 84]], OL: [["Bears O-Line", 85, "Joe Thuney · Jonah Jackson"]], K: [["Cairo Santos", 82]], DST: [["Bears D/ST", 84, "Jeffery Simmons · Montez Sweat"]] },
  CIN: { QB: [["Joe Burrow", 96]], RB: [["Chase Brown", 84]], WR: [["Ja'Marr Chase", 98], ["Tee Higgins", 88], ["Andrei Iosivas", 72]], TE: [["Mike Gesicki", 73]], OL: [["Bengals O-Line", 77, "Orlando Brown Jr. · Ted Karras"]], K: [["Evan McPherson", 82]], DST: [["Bengals D/ST", 78, "Dexter Lawrence · B.J. Hill"]] },
  CLE: { QB: [["Shedeur Sanders", 73], ["Deshaun Watson", 71]], RB: [["Quinshon Judkins", 82]], WR: [["Jerry Jeudy", 78], ["Cedric Tillman", 72], ["Isaiah Bond", 69]], TE: [["Harold Fannin Jr.", 78]], OL: [["Browns O-Line", 74, "Tytus Howard · Wyatt Teller"]], K: [["Andre Szmyt", 74]], DST: [["Browns D/ST", 82, "Jared Verse · Denzel Ward"]] },
  DAL: { QB: [["Dak Prescott", 87]], RB: [["Javonte Williams", 80]], WR: [["CeeDee Lamb", 93], ["George Pickens", 87], ["Ryan Flournoy", 70]], TE: [["Jake Ferguson", 80]], OL: [["Cowboys O-Line", 84, "Tyler Smith · Tyler Booker"]], K: [["Brandon Aubrey", 94]], DST: [["Cowboys D/ST", 75, "DaRon Bland · Kenny Clark"]] },
  DEN: { QB: [["Bo Nix", 85]], RB: [["J.K. Dobbins", 80], ["RJ Harvey", 78]], WR: [["Jaylen Waddle", 85], ["Courtland Sutton", 83], ["Marvin Mims Jr.", 75]], TE: [["Evan Engram", 77]], OL: [["Broncos O-Line", 90, "Garett Bolles · Quinn Meinerz"]], K: [["Wil Lutz", 84]], DST: [["Broncos D/ST", 90, "Pat Surtain II · Nik Bonitto"]] },
  DET: { QB: [["Jared Goff", 90]], RB: [["Jahmyr Gibbs", 96]], WR: [["Amon-Ra St. Brown", 95], ["Jameson Williams", 85], ["Isaac TeSlaa", 74]], TE: [["Sam LaPorta", 84]], OL: [["Lions O-Line", 86, "Penei Sewell · Taylor Decker"]], K: [["Jake Bates", 84]], DST: [["Lions D/ST", 84, "Aidan Hutchinson · Kerby Joseph"]] },
  GB: { QB: [["Jordan Love", 87]], RB: [["Josh Jacobs", 87]], WR: [["Matthew Golden", 80], ["Jayden Reed", 80], ["Christian Watson", 79]], TE: [["Tucker Kraft", 86]], OL: [["Packers O-Line", 82, "Zach Tom · Jordan Morgan"]], K: [["Brandon McManus", 82]], DST: [["Packers D/ST", 89, "Micah Parsons · Javon Hargrave"]] },
  HOU: { QB: [["C.J. Stroud", 83]], RB: [["David Montgomery", 82], ["Woody Marks", 76]], WR: [["Nico Collins", 91], ["Jayden Higgins", 77], ["Jaylin Noel", 72]], TE: [["Dalton Schultz", 76]], OL: [["Texans O-Line", 75, "Braden Smith · Aireontae Ersery"]], K: [["Ka'imi Fairbairn", 88]], DST: [["Texans D/ST", 93, "Will Anderson Jr. · Derek Stingley Jr."]] },
  IND: { QB: [["Daniel Jones", 81]], RB: [["Jonathan Taylor", 94]], WR: [["Alec Pierce", 81], ["Josh Downs", 80], ["Keenan Allen", 76]], TE: [["Tyler Warren", 85]], OL: [["Colts O-Line", 86, "Quenton Nelson · Bernhard Raimann"]], K: [["Spencer Shrader", 78]], DST: [["Colts D/ST", 80, "DeForest Buckner · Sauce Gardner"]] },
  JAX: { QB: [["Trevor Lawrence", 83]], RB: [["Bhayshul Tuten", 77], ["Chris Rodriguez Jr.", 74]], WR: [["Brian Thomas Jr.", 85], ["Travis Hunter", 84], ["Jakobi Meyers", 79]], TE: [["Brenton Strange", 77]], OL: [["Jaguars O-Line", 74, "Ezra Cleveland · Robert Hainsey"]], K: [["Cam Little", 87]], DST: [["Jaguars D/ST", 84, "Josh Hines-Allen · Jessie Bates III"]] },
  KC: { QB: [["Patrick Mahomes", 93]], RB: [["Kenneth Walker III", 85]], WR: [["Rashee Rice", 85], ["Xavier Worthy", 80], ["Jalen Royals", 70]], TE: [["Travis Kelce", 84]], OL: [["Chiefs O-Line", 88, "Creed Humphrey · Trey Smith"]], K: [["Harrison Butker", 86]], DST: [["Chiefs D/ST", 82, "Chris Jones · George Karlaftis"]] },
  LV: { QB: [["Fernando Mendoza", 74]], RB: [["Ashton Jeanty", 88]], WR: [["Tre Tucker", 76], ["Jack Bech", 72], ["Jalen Nailor", 72]], TE: [["Brock Bowers", 94]], OL: [["Raiders O-Line", 82, "Kolton Miller · Tyler Linderbaum"]], K: [["Daniel Carlson", 85]], DST: [["Raiders D/ST", 77, "Maxx Crosby · Malcolm Koonce"]] },
  LAC: { QB: [["Justin Herbert", 90]], RB: [["Omarion Hampton", 83]], WR: [["Ladd McConkey", 87], ["Quentin Johnston", 80], ["Tre' Harris", 74]], TE: [["David Njoku", 77]], OL: [["Chargers O-Line", 85, "Joe Alt · Rashawn Slater"]], K: [["Cameron Dicker", 93]], DST: [["Chargers D/ST", 84, "Derwin James Jr. · Tuli Tuipulotu"]] },
  LAR: { QB: [["Matthew Stafford", 91]], RB: [["Kyren Williams", 85], ["Blake Corum", 74]], WR: [["Puka Nacua", 96], ["Davante Adams", 85], ["Jordan Whittington", 70]], TE: [["Colby Parkinson", 72]], OL: [["Rams O-Line", 80, "Rob Havenstein · Steve Avila"]], K: [["Joshua Karty", 80]], DST: [["Rams D/ST", 90, "Myles Garrett · Trent McDuffie"]] },
  MIA: { QB: [["Malik Willis", 75]], RB: [["De'Von Achane", 91]], WR: [["Malik Washington", 75], ["Caleb Douglas", 70], ["Chris Bell", 70]], TE: [["Greg Dulcich", 70]], OL: [["Dolphins O-Line", 74, "Austin Jackson · Aaron Brewer"]], K: [["Dolphins Kicking Unit", 66, "Job unsettled after November moves"]], DST: [["Dolphins D/ST", 72, "Zach Sieler · Jordyn Brooks"]] },
  MIN: { QB: [["Kyler Murray", 80], ["Kirk Cousins", 79]], RB: [["Aaron Jones", 80], ["Jordan Mason", 77]], WR: [["Justin Jefferson", 96], ["Jordan Addison", 83], ["Jauan Jennings", 77]], TE: [["T.J. Hockenson", 79]], OL: [["Vikings O-Line", 84, "Christian Darrisaw · Brian O'Neill"]], K: [["Will Reichard", 84]], DST: [["Vikings D/ST", 91, "Andrew Van Ginkel · Jonathan Greenard"]] },
  NE: { QB: [["Drake Maye", 91]], RB: [["TreVeyon Henderson", 82], ["Rhamondre Stevenson", 77]], WR: [["A.J. Brown", 89], ["Romeo Doubs", 78], ["Kayshon Boutte", 75]], TE: [["Hunter Henry", 79]], OL: [["Patriots O-Line", 80, "Will Campbell · Mike Onwenu"]], K: [["Andy Borregales", 78]], DST: [["Patriots D/ST", 84, "Christian Gonzalez · Milton Williams"]] },
  NO: { QB: [["Tyler Shough", 74]], RB: [["Travis Etienne Jr.", 81], ["Alvin Kamara", 78]], WR: [["Chris Olave", 85], ["Jordyn Tyson", 76], ["Devaughn Vele", 72]], TE: [["Juwan Johnson", 75]], OL: [["Saints O-Line", 77, "Erik McCoy · Kelvin Banks Jr."]], K: [["Charlie Smyth", 77]], DST: [["Saints D/ST", 75, "Chase Young · Bryan Bresee"]] },
  NYG: { QB: [["Jameis Winston", 72], ["J.J. McCarthy", 70]], RB: [["Cam Skattebo", 81]], WR: [["Malik Nabers", 91], ["Darius Slayton", 74], ["Jalin Hyatt", 68]], TE: [["Isaiah Likely", 78], ["Theo Johnson", 74]], OL: [["Giants O-Line", 78, "Andrew Thomas · Jermaine Eluemunor"]], K: [["Graham Gano", 76]], DST: [["Giants D/ST", 82, "Brian Burns · Abdul Carter"]] },
  NYJ: { QB: [["Geno Smith", 77]], RB: [["Breece Hall", 84]], WR: [["Garrett Wilson", 88], ["Omar Cooper Jr.", 74], ["Adonai Mitchell", 72]], TE: [["Mason Taylor", 75]], OL: [["Jets O-Line", 80, "Olu Fashanu · Armand Membou"]], K: [["Blake Grupe", 76]], DST: [["Jets D/ST", 80, "Minkah Fitzpatrick · Jermaine Johnson"]] },
  PHI: { QB: [["Tanner McKee", 71], ["Joe Milton III", 69]], RB: [["Saquon Barkley", 92]], WR: [["DeVonta Smith", 87], ["Makai Lemon", 76], ["Darius Cooper", 72]], TE: [["Dallas Goedert", 80]], OL: [["Eagles O-Line", 92, "Lane Johnson · Jordan Mailata"]], K: [["Jake Elliott", 82]], DST: [["Eagles D/ST", 87, "Jalen Carter · Quinyon Mitchell"]] },
  PIT: { QB: [["Aaron Rodgers", 79]], RB: [["Jaylen Warren", 79], ["Rico Dowdle", 79]], WR: [["DK Metcalf", 85], ["Michael Pittman Jr.", 80], ["Roman Wilson", 72]], TE: [["Pat Freiermuth", 76]], OL: [["Steelers O-Line", 78, "Troy Fautanu · Zach Frazier"]], K: [["Chris Boswell", 92]], DST: [["Steelers D/ST", 88, "T.J. Watt · Jalen Ramsey"]] },
  SF: { QB: [["Brock Purdy", 89]], RB: [["Christian McCaffrey", 92]], WR: [["Mike Evans", 87], ["Christian Kirk", 74], ["De'Zhaun Stribling", 72]], TE: [["George Kittle", 91]], OL: [["49ers O-Line", 86, "Trent Williams · Dominick Puni"]], K: [["Eddy Piñeiro", 82]], DST: [["49ers D/ST", 88, "Nick Bosa · Fred Warner"]] },
  SEA: { QB: [["Sam Darnold", 85]], RB: [["Zach Charbonnet", 80]], WR: [["Jaxon Smith-Njigba", 95], ["Rashid Shaheed", 79], ["Cooper Kupp", 78]], TE: [["AJ Barner", 74]], OL: [["Seahawks O-Line", 78, "Charles Cross · Grey Zabel"]], K: [["Jason Myers", 84]], DST: [["Seahawks D/ST", 90, "Devon Witherspoon · Leonard Williams"]] },
  TB: { QB: [["Baker Mayfield", 88]], RB: [["Bucky Irving", 85]], WR: [["Emeka Egbuka", 86], ["Chris Godwin", 82], ["Jalen McMillan", 77]], TE: [["Cade Otton", 76]], OL: [["Buccaneers O-Line", 88, "Tristan Wirfs · Graham Barton"]], K: [["Chase McLaughlin", 86]], DST: [["Buccaneers D/ST", 87, "Vita Vea · Antoine Winfield Jr."]] },
  TEN: { QB: [["Cam Ward", 75]], RB: [["Tony Pollard", 78], ["Tyjae Spears", 74]], WR: [["Wan'Dale Robinson", 79], ["Calvin Ridley", 78], ["Carnell Tate", 77]], TE: [["Gunnar Helm", 72]], OL: [["Titans O-Line", 74, "JC Latham · Peter Skoronski"]], K: [["Joey Slye", 80]], DST: [["Titans D/ST", 72, "Cedric Gray · T'Vondre Sweat"]] },
  WAS: { QB: [["Jayden Daniels", 89]], RB: [["Jacory Croskey-Merritt", 78], ["Rachaad White", 75]], WR: [["Terry McLaurin", 86], ["Stefon Diggs", 78], ["Dyami Brown", 72]], TE: [["Chig Okonkwo", 74]], OL: [["Commanders O-Line", 82, "Laremy Tunsil · Sam Cosmi"]], K: [["Matt Gay", 78]], DST: [["Commanders D/ST", 77, "Frankie Luvu · Dorance Armstrong"]] }
};

export const ALLTIME = {
  ARI: { QB: [["Kurt Warner", 90]], RB: [["Ottis Anderson", 85]], WR: [["Larry Fitzgerald", 96], ["Anquan Boldin", 87], ["Roy Green", 84]], TE: [["Jackie Smith", 85]], OL: [["Cardinals Legends O-Line", 88, "Dan Dierdorf · Conrad Dobler"]], K: [["Neil Rackers", 80]], DST: [["Cardinals Legends D", 85, "Aeneas Williams · Larry Wilson"]] },
  ATL: { QB: [["Matt Ryan", 90]], RB: [["Michael Turner", 85], ["Jamal Anderson", 84]], WR: [["Julio Jones", 97], ["Roddy White", 88], ["Andre Rison", 85]], TE: [["Tony Gonzalez", 91]], OL: [["Falcons Legends O-Line", 85, "Jeff Van Note · Mike Kenn"]], K: [["Morten Andersen", 86]], DST: [["Falcons Legends D", 82, "Deion Sanders · Claude Humphrey"]] },
  BAL: { QB: [["Lamar Jackson", 96]], RB: [["Jamal Lewis", 88], ["Ray Rice", 84]], WR: [["Derrick Mason", 84], ["Anquan Boldin", 84], ["Torrey Smith", 80]], TE: [["Mark Andrews", 87]], OL: [["Ravens Legends O-Line", 97, "Jonathan Ogden · Marshal Yanda"]], K: [["Justin Tucker", 99]], DST: [["2000 Ravens D", 97, "Ray Lewis · Ed Reed"]] },
  BUF: { QB: [["Josh Allen", 97], ["Jim Kelly", 91]], RB: [["Thurman Thomas", 93], ["O.J. Simpson", 92]], WR: [["Andre Reed", 89], ["Stefon Diggs", 87], ["Eric Moulds", 84]], TE: [["Pete Metzelaars", 75]], OL: [["Bills Legends O-Line", 89, "Joe DeLamielleure · Billy Shaw"]], K: [["Steve Christie", 82]], DST: [["Bills Legends D", 91, "Bruce Smith · Cornelius Bennett"]] },
  CAR: { QB: [["Cam Newton", 89]], RB: [["Christian McCaffrey", 91], ["DeAngelo Williams", 84]], WR: [["Steve Smith Sr.", 93], ["Muhsin Muhammad", 85], ["DJ Moore", 82]], TE: [["Greg Olsen", 87]], OL: [["Panthers Legends O-Line", 87, "Jordan Gross · Ryan Kalil"]], K: [["John Kasay", 84]], DST: [["Panthers Legends D", 92, "Luke Kuechly · Julius Peppers"]] },
  CHI: { QB: [["Sid Luckman", 86], ["Jay Cutler", 80]], RB: [["Walter Payton", 98], ["Gale Sayers", 96]], WR: [["Brandon Marshall", 87], ["Alshon Jeffery", 83], ["Allen Robinson", 82]], TE: [["Mike Ditka", 90]], OL: [["Bears Legends O-Line", 88, "Jimbo Covert · Bulldog Turner"]], K: [["Robbie Gould", 87]], DST: [["1985 Bears D", 99, "Mike Singletary · Richard Dent"]] },
  CIN: { QB: [["Joe Burrow", 94], ["Ken Anderson", 86]], RB: [["Corey Dillon", 88]], WR: [["Ja'Marr Chase", 98], ["A.J. Green", 91], ["Chad Johnson", 89]], TE: [["Tyler Eifert", 78]], OL: [["Bengals Legends O-Line", 97, "Anthony Muñoz · Willie Anderson"]], K: [["Evan McPherson", 84]], DST: [["Bengals Legends D", 82, "Ken Riley · Geno Atkins"]] },
  CLE: { QB: [["Otto Graham", 95]], RB: [["Jim Brown", 99], ["Nick Chubb", 88]], WR: [["Paul Warfield", 88], ["Dante Lavelli", 84], ["Josh Gordon", 84]], TE: [["Ozzie Newsome", 92]], OL: [["Browns Legends O-Line", 96, "Joe Thomas · Gene Hickerson"]], K: [["Lou Groza", 90]], DST: [["Browns Legends D", 86, "Myles Garrett · Clay Matthews Jr."]] },
  DAL: { QB: [["Roger Staubach", 92], ["Troy Aikman", 90]], RB: [["Emmitt Smith", 96], ["Tony Dorsett", 92]], WR: [["CeeDee Lamb", 93], ["Michael Irvin", 92], ["Dez Bryant", 88]], TE: [["Jason Witten", 91]], OL: [["Cowboys Legends O-Line", 97, "Larry Allen · Rayfield Wright"]], K: [["Brandon Aubrey", 92]], DST: [["Doomsday Defense", 93, "Randy White · Bob Lilly"]] },
  DEN: { QB: [["John Elway", 95]], RB: [["Terrell Davis", 94]], WR: [["Demaryius Thomas", 89], ["Rod Smith", 87], ["Ed McCaffrey", 84]], TE: [["Shannon Sharpe", 93]], OL: [["Broncos Legends O-Line", 90, "Gary Zimmerman · Ryan Clady"]], K: [["Jason Elam", 86]], DST: [["Broncos Legends D", 94, "Von Miller · Champ Bailey"]] },
  DET: { QB: [["Matthew Stafford", 88], ["Bobby Layne", 86]], RB: [["Barry Sanders", 99]], WR: [["Calvin Johnson", 98], ["Amon-Ra St. Brown", 95], ["Herman Moore", 87]], TE: [["Charlie Sanders", 86]], OL: [["Lions Legends O-Line", 90, "Lomas Brown · Penei Sewell"]], K: [["Jason Hanson", 87]], DST: [["Lions Legends D", 86, "Night Train Lane · Alex Karras"]] },
  GB: { QB: [["Aaron Rodgers", 97], ["Brett Favre", 94]], RB: [["Ahman Green", 87], ["Jim Taylor", 86]], WR: [["Don Hutson", 95], ["Davante Adams", 94], ["Sterling Sharpe", 91]], TE: [["Paul Coffman", 79]], OL: [["Lombardi O-Line", 94, "Forrest Gregg · Jerry Kramer"]], K: [["Mason Crosby", 84]], DST: [["Packers Legends D", 91, "Reggie White · Ray Nitschke"]] },
  HOU: { QB: [["C.J. Stroud", 85], ["Matt Schaub", 80]], RB: [["Arian Foster", 90]], WR: [["Andre Johnson", 94], ["DeAndre Hopkins", 94], ["Nico Collins", 91]], TE: [["Owen Daniels", 80]], OL: [["Texans Legends O-Line", 87, "Duane Brown · Laremy Tunsil"]], K: [["Ka'imi Fairbairn", 88]], DST: [["Texans Legends D", 92, "J.J. Watt · Will Anderson Jr."]] },
  IND: { QB: [["Peyton Manning", 98], ["Johnny Unitas", 95]], RB: [["Edgerrin James", 91], ["Marshall Faulk", 88]], WR: [["Marvin Harrison", 95], ["Reggie Wayne", 92], ["Raymond Berry", 89]], TE: [["John Mackey", 92]], OL: [["Colts Legends O-Line", 94, "Jim Parker · Jeff Saturday"]], K: [["Adam Vinatieri", 92]], DST: [["Colts Legends D", 88, "Dwight Freeney · Robert Mathis"]] },
  JAX: { QB: [["Mark Brunell", 84], ["Trevor Lawrence", 82]], RB: [["Fred Taylor", 91], ["Maurice Jones-Drew", 89]], WR: [["Jimmy Smith", 90], ["Keenan McCardell", 85], ["Brian Thomas Jr.", 86]], TE: [["Marcedes Lewis", 80]], OL: [["Jaguars Legends O-Line", 90, "Tony Boselli · Brad Meester"]], K: [["Cam Little", 85]], DST: [["Sacksonville D", 86, "Calais Campbell · Jalen Ramsey"]] },
  KC: { QB: [["Patrick Mahomes", 99], ["Len Dawson", 86]], RB: [["Jamaal Charles", 92], ["Priest Holmes", 92]], WR: [["Tyreek Hill", 96], ["Otis Taylor", 84], ["Dwayne Bowe", 83]], TE: [["Travis Kelce", 97], ["Tony Gonzalez", 95]], OL: [["Chiefs Legends O-Line", 92, "Will Shields · Brian Waters"]], K: [["Harrison Butker", 89]], DST: [["Chiefs Legends D", 91, "Derrick Thomas · Chris Jones"]] },
  LV: { QB: [["Rich Gannon", 87], ["Ken Stabler", 86]], RB: [["Marcus Allen", 93], ["Bo Jackson", 92]], WR: [["Tim Brown", 92], ["Cliff Branch", 87], ["Fred Biletnikoff", 87]], TE: [["Brock Bowers", 93], ["Dave Casper", 89]], OL: [["Raiders Legends O-Line", 97, "Art Shell · Gene Upshaw"]], K: [["Sebastian Janikowski", 86]], DST: [["Raiders Legends D", 89, "Howie Long · Charles Woodson"]] },
  LAC: { QB: [["Dan Fouts", 90], ["Philip Rivers", 89]], RB: [["LaDainian Tomlinson", 98]], WR: [["Lance Alworth", 94], ["Keenan Allen", 89], ["Charlie Joiner", 86]], TE: [["Antonio Gates", 95], ["Kellen Winslow", 92]], OL: [["Chargers Legends O-Line", 88, "Ron Mix · Russ Washington"]], K: [["Cameron Dicker", 92]], DST: [["Chargers Legends D", 89, "Junior Seau · Derwin James Jr."]] },
  LAR: { QB: [["Kurt Warner", 93], ["Matthew Stafford", 90]], RB: [["Marshall Faulk", 97], ["Eric Dickerson", 96]], WR: [["Cooper Kupp", 94], ["Isaac Bruce", 92], ["Torry Holt", 92]], TE: [["Tyler Higbee", 76]], OL: [["Rams Legends O-Line", 95, "Orlando Pace · Jackie Slater"]], K: [["Greg Zuerlein", 86]], DST: [["Rams Legends D", 96, "Aaron Donald · Deacon Jones"]] },
  MIA: { QB: [["Dan Marino", 97]], RB: [["Larry Csonka", 89], ["Ricky Williams", 86]], WR: [["Tyreek Hill", 94], ["Mark Clayton", 87], ["Mark Duper", 86]], TE: [["Keith Jackson", 80]], OL: [["Dolphins Legends O-Line", 96, "Dwight Stephenson · Larry Little"]], K: [["Olindo Mare", 84]], DST: [["Dolphins Legends D", 88, "Jason Taylor · Zach Thomas"]] },
  MIN: { QB: [["Fran Tarkenton", 90]], RB: [["Adrian Peterson", 97]], WR: [["Randy Moss", 99], ["Justin Jefferson", 98], ["Cris Carter", 94]], TE: [["Steve Jordan", 82]], OL: [["Vikings Legends O-Line", 95, "Randall McDaniel · Ron Yary"]], K: [["Gary Anderson", 86]], DST: [["Purple People Eaters", 94, "Alan Page · Carl Eller"]] },
  NE: { QB: [["Tom Brady", 99]], RB: [["Corey Dillon", 86]], WR: [["Randy Moss", 96], ["Wes Welker", 89], ["Julian Edelman", 86]], TE: [["Rob Gronkowski", 98]], OL: [["Patriots Legends O-Line", 95, "John Hannah · Logan Mankins"]], K: [["Adam Vinatieri", 93]], DST: [["2003 Patriots D", 90, "Ty Law · Tedy Bruschi"]] },
  NO: { QB: [["Drew Brees", 96]], RB: [["Alvin Kamara", 89], ["Deuce McAllister", 85]], WR: [["Michael Thomas", 92], ["Marques Colston", 87], ["Joe Horn", 86]], TE: [["Jimmy Graham", 92]], OL: [["Saints Legends O-Line", 94, "Willie Roaf · Jahri Evans"]], K: [["John Carney", 84]], DST: [["Dome Patrol", 92, "Rickey Jackson · Sam Mills"]] },
  NYG: { QB: [["Eli Manning", 85], ["Phil Simms", 82]], RB: [["Saquon Barkley", 90], ["Tiki Barber", 88]], WR: [["Odell Beckham Jr.", 92], ["Plaxico Burress", 83], ["Amani Toomer", 82]], TE: [["Mark Bavaro", 86], ["Jeremy Shockey", 86]], OL: [["Giants Legends O-Line", 92, "Roosevelt Brown · Mel Hein"]], K: [["Lawrence Tynes", 80]], DST: [["Giants Legends D", 96, "Lawrence Taylor · Michael Strahan"]] },
  NYJ: { QB: [["Joe Namath", 85]], RB: [["Curtis Martin", 92]], WR: [["Don Maynard", 89], ["Garrett Wilson", 88], ["Al Toon", 85]], TE: [["Mickey Shuler", 78]], OL: [["Jets Legends O-Line", 91, "Kevin Mawae · Nick Mangold"]], K: [["Pat Leahy", 82]], DST: [["Jets Legends D", 90, "Darrelle Revis · Joe Klecko"]] },
  PHI: { QB: [["Jalen Hurts", 89], ["Donovan McNabb", 87]], RB: [["LeSean McCoy", 89], ["Brian Westbrook", 88]], WR: [["A.J. Brown", 92], ["Terrell Owens", 90], ["Harold Carmichael", 87]], TE: [["Zach Ertz", 87]], OL: [["Eagles Legends O-Line", 96, "Jason Kelce · Lane Johnson"]], K: [["David Akers", 86]], DST: [["Eagles Legends D", 94, "Reggie White · Brian Dawkins"]] },
  PIT: { QB: [["Ben Roethlisberger", 88], ["Terry Bradshaw", 87]], RB: [["Franco Harris", 92], ["Jerome Bettis", 90]], WR: [["Antonio Brown", 96], ["Lynn Swann", 88], ["John Stallworth", 88]], TE: [["Heath Miller", 86]], OL: [["Steelers Legends O-Line", 95, "Mike Webster · Dermontti Dawson"]], K: [["Chris Boswell", 92]], DST: [["Steel Curtain", 99, "Mean Joe Greene · Jack Lambert"]] },
  SF: { QB: [["Joe Montana", 98], ["Steve Young", 96]], RB: [["Roger Craig", 90], ["Frank Gore", 89]], WR: [["Jerry Rice", 99], ["Terrell Owens", 93], ["Dwight Clark", 84]], TE: [["George Kittle", 93]], OL: [["49ers Legends O-Line", 94, "Trent Williams · Joe Staley"]], K: [["Robbie Gould", 86]], DST: [["49ers Legends D", 95, "Ronnie Lott · Charles Haley"]] },
  SEA: { QB: [["Russell Wilson", 90]], RB: [["Shaun Alexander", 92], ["Marshawn Lynch", 92]], WR: [["Steve Largent", 92], ["Jaxon Smith-Njigba", 94], ["Doug Baldwin", 86]], TE: [["Jimmy Graham", 84]], OL: [["Seahawks Legends O-Line", 97, "Walter Jones · Steve Hutchinson"]], K: [["Jason Myers", 84]], DST: [["Legion of Boom", 97, "Richard Sherman · Earl Thomas"]] },
  TB: { QB: [["Tom Brady", 92]], RB: [["Warrick Dunn", 85], ["Mike Alstott", 84]], WR: [["Mike Evans", 93], ["Chris Godwin", 87], ["Joey Galloway", 82]], TE: [["Jimmie Giles", 82]], OL: [["Buccaneers Legends O-Line", 91, "Tristan Wirfs · Paul Gruber"]], K: [["Martin Gramatica", 82]], DST: [["2002 Buccaneers D", 97, "Derrick Brooks · Warren Sapp"]] },
  TEN: { QB: [["Warren Moon", 90], ["Steve McNair", 88]], RB: [["Earl Campbell", 95], ["Derrick Henry", 94], ["Eddie George", 88]], WR: [["A.J. Brown", 88], ["Drew Hill", 84], ["Ernest Givins", 83]], TE: [["Delanie Walker", 85]], OL: [["Oilers/Titans Legends O-Line", 97, "Bruce Matthews · Mike Munchak"]], K: [["Rob Bironas", 84]], DST: [["Oilers/Titans Legends D", 87, "Jevon Kearse · Elvin Bethea"]] },
  WAS: { QB: [["Sammy Baugh", 90], ["Sonny Jurgensen", 87]], RB: [["John Riggins", 91], ["Clinton Portis", 87]], WR: [["Art Monk", 91], ["Charley Taylor", 88], ["Gary Clark", 87]], TE: [["Jerry Smith", 84]], OL: [["The Hogs", 95, "Russ Grimm · Joe Jacoby"]], K: [["Mark Moseley", 82]], DST: [["Washington Legends D", 90, "Darrell Green · Sean Taylor"]] }
};

export const MODES = {
  current: { label: "Current", blurb: "2026 season rosters", data: CURRENT },
  alltime: { label: "All-Time", blurb: "Franchise legends", data: ALLTIME }
};

const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
export function getTeam(id) {
  return TEAM_BY_ID[id];
}

export function logoUrl(teamId) {
  const team = TEAM_BY_ID[teamId];
  return team ? `${LOGO_BASE}${team.espn}.png` : "";
}

export const POSITION_ORDER = ["QB", "RB", "WR", "TE", "OL", "K", "DST"];

// Every entry gets a stable id: "<mode>:<team>:<pos>:<index>"
const entryCache = {};
export function teamEntries(mode, teamId) {
  const key = `${mode}:${teamId}`;
  if (entryCache[key]) return entryCache[key];
  const roster = MODES[mode].data[teamId];
  const list = [];
  for (const pos of POSITION_ORDER) {
    (roster[pos] || []).forEach(([name, ovr, detail], i) => {
      list.push({ id: `${mode}:${teamId}:${pos}:${i}`, team: teamId, pos, name, ovr, detail: detail || "" });
    });
  }
  entryCache[key] = list;
  return list;
}

// Returns null for anything malformed: ids also arrive from the other player's browser.
export function getEntry(id) {
  if (typeof id !== "string" || id.length > 40) return null;
  const [mode, teamId] = id.split(":");
  if (!MODES[mode] || !TEAM_BY_ID[teamId]) return null;
  return teamEntries(mode, teamId).find((e) => e.id === id) || null;
}
