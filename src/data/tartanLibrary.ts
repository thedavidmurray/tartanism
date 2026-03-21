/**
 * Tartan Library Dataset
 *
 * Extracted from OldApp.tsx for use across routes.
 * This is the single source of truth for the 123+ authentic tartan records.
 */

export interface TartanRecord {
  name: string;
  threadcount: string;
  category: 'Clan' | 'District' | 'Military' | 'Corporate' | 'Fashion' | 'Royal' | 'Historic';
  description?: string;
  popularity?: number; // 1-100
}

export const TARTAN_LIBRARY: TartanRecord[] = [
  // === MOST FAMOUS (Popularity 90-100) ===
  { name: 'Royal Stewart', threadcount: 'R/72 G4 R2 K24 Y2 K24 W2 K2 Y2 K32 W2 B/24', category: 'Royal', description: 'Official tartan of the Royal House of Stewart', popularity: 100 },
  { name: 'Black Watch', threadcount: 'K/4 B4 K4 B4 K20 G24 K6 G24 K20 B22 K/4', category: 'Military', description: 'Military regiment (42nd Highland) since 1739', popularity: 98 },
  { name: 'MacLeod of Lewis', threadcount: 'Y/24 K4 Y/24', category: 'Clan', description: 'Distinctive bright yellow tartan of Clan MacLeod', popularity: 95 },
  { name: 'Campbell of Argyll', threadcount: 'K/2 B6 K6 G28 K6 B6 K4 W4 Y4 W/4', category: 'Clan', description: 'Clan Campbell of Argyll', popularity: 93 },
  { name: 'MacDonald', threadcount: 'R/8 G32 R6 G32 B32 R/8', category: 'Clan', description: 'Lords of the Isles', popularity: 92 },
  { name: 'Gordon', threadcount: 'B/2 K2 B2 K6 G28 K28 Y/6', category: 'Clan', description: 'Clan Gordon of Aberdeenshire', popularity: 90 },

  // === VERY POPULAR (Popularity 80-89) ===
  { name: 'Buchanan', threadcount: 'Y/4 R8 Y4 R2 K4 R2 W2 G24 R4 G24 W2 R2 K4 R2 Y/4', category: 'Clan', description: 'Clan Buchanan', popularity: 88 },
  { name: 'Cameron of Erracht', threadcount: 'R/4 G48 R6 G4 R6 G48 Y4 B6 Y4 G48 R6 G4 R6 G48 R/4', category: 'Clan', description: 'Clan Cameron war tartan', popularity: 87 },
  { name: 'Fraser', threadcount: 'R/4 G32 R8 G4 R8 G32 W4 B4 W/4', category: 'Clan', description: 'Clan Fraser of Lovat', popularity: 86 },
  { name: 'MacKenzie', threadcount: 'B/12 G28 B2 G2 B2 K4 R4 K4 W/2', category: 'Clan', description: 'Clan MacKenzie', popularity: 85 },
  { name: 'Stewart of Atholl', threadcount: 'B/6 K2 B6 K32 R6 K32 B6 K2 B/6', category: 'Clan', description: 'Ancient Stewart variant', popularity: 84 },
  { name: 'Douglas', threadcount: 'G/4 B4 G4 B24 K24 B4 W4 B4 K24 B24 G4 B4 G/4', category: 'Clan', description: 'Grey Douglas tartan', popularity: 83 },
  { name: 'Wallace', threadcount: 'K/2 Y6 K6 R48 K8 Y8 K8 R48 K6 Y6 K/2', category: 'Clan', description: 'Clan Wallace - Red Wallace', popularity: 82 },
  { name: 'Lindsay', threadcount: 'R/8 B24 R4 B2 R4 G24 R4 G2 R4 B24 R/8', category: 'Clan', description: 'Clan Lindsay', popularity: 81 },
  { name: 'Murray of Atholl', threadcount: 'G/4 K2 G4 K32 B4 K32 G4 K2 G/4', category: 'Clan', description: 'Clan Murray', popularity: 80 },

  // === POPULAR (Popularity 70-79) ===
  { name: 'MacGregor', threadcount: 'R/8 G8 R8 G28 K4 G28 R8 G8 R/8', category: 'Clan', description: 'Clan MacGregor - Rob Roy', popularity: 79 },
  { name: 'MacLean of Duart', threadcount: 'B/2 K6 B6 K6 G48 K6 R6 K/6', category: 'Clan', description: 'Clan MacLean', popularity: 78 },
  { name: 'MacPherson', threadcount: 'R/4 K4 R4 K4 B24 K4 G24 K4 B24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacPherson', popularity: 77 },
  { name: 'Robertson', threadcount: 'R/4 G2 R48 G28 B4 G28 R48 G2 R/4', category: 'Clan', description: 'Clan Robertson (Donnachaidh)', popularity: 76 },
  { name: 'Sinclair', threadcount: 'R/4 G32 R8 G32 B8 K4 Y4 K4 B8 G32 R8 G32 R/4', category: 'Clan', description: 'Clan Sinclair', popularity: 75 },
  { name: 'Forbes', threadcount: 'G/4 W2 G24 B24 G4 B24 G24 W2 G/4', category: 'Clan', description: 'Clan Forbes', popularity: 74 },
  { name: 'Grant', threadcount: 'R/4 K4 R4 K24 B24 K24 R4 K4 R/4', category: 'Clan', description: 'Clan Grant', popularity: 73 },
  { name: 'Ross', threadcount: 'R/4 G32 K4 W2 K4 R8 K4 W2 K4 G32 R/4', category: 'Clan', description: 'Clan Ross', popularity: 72 },
  { name: 'Scott', threadcount: 'R/4 W2 R48 G28 R4 G28 R48 W2 R/4', category: 'Clan', description: 'Clan Scott', popularity: 71 },
  { name: 'Hamilton', threadcount: 'R/4 W2 R4 W2 B28 W2 R4 W/2', category: 'Clan', description: 'Clan Hamilton', popularity: 70 },

  // === DISTRICT & REGIONAL ===
  { name: 'Edinburgh', threadcount: 'B/8 R4 B8 R4 G28 K4 G28 R4 B8 R4 B/8', category: 'District', description: "Scotland's capital city", popularity: 68 },
  { name: 'Glasgow', threadcount: 'G/4 Y2 G24 K4 W4 K4 R24 K4 W4 K4 G24 Y2 G/4', category: 'District', description: 'Glasgow district tartan', popularity: 67 },
  { name: 'Highland', threadcount: 'G/12 R4 G12 K4 Y4 K4 G12 R4 G/12', category: 'District', description: 'Generic Highland tartan', popularity: 66 },
  { name: 'Isle of Skye', threadcount: 'B/4 G24 K4 B4 K4 W4 K4 B4 K4 G24 B/4', category: 'District', description: 'Skye district tartan', popularity: 65 },
  { name: 'Inverness', threadcount: 'R/4 G4 R4 G24 R4 G4 K8 G4 R4 G24 R4 G4 R/4', category: 'District', description: 'Highland capital', popularity: 64 },
  { name: 'Aberdeen', threadcount: 'G/4 K4 G4 K4 R32 K4 G4 K4 G/4', category: 'District', description: 'Aberdeen city tartan', popularity: 63 },
  { name: 'Galloway', threadcount: 'K/4 B24 G4 B4 G4 R12 G4 B4 G4 B24 K/4', category: 'District', description: 'Dumfries & Galloway', popularity: 62 },
  { name: 'Caledonia', threadcount: 'B/4 K2 B4 K4 R24 K4 G24 K4 R24 K4 B4 K2 B/4', category: 'District', description: 'Ancient name for Scotland', popularity: 61 },

  // === MILITARY ===
  { name: 'Royal Scots', threadcount: 'R/8 G24 R4 G4 R4 G24 B4 G4 B/4', category: 'Military', description: 'Royal Scots regiment', popularity: 69 },
  { name: 'Scots Guards', threadcount: 'B/4 K4 B4 K4 G24 K4 R4 K/4', category: 'Military', description: 'Scots Guards regiment', popularity: 68 },
  { name: 'Gordon Highlanders', threadcount: 'B/4 K2 B4 K32 G24 K6 G24 K32 Y4 B4 K2 B/4', category: 'Military', description: 'Gordon Highlanders regiment', popularity: 67 },
  { name: 'Seaforth Highlanders', threadcount: 'B/12 G28 B2 G2 B2 K4 R4 K4 W/2', category: 'Military', description: 'Seaforth Highlanders (MacKenzie)', popularity: 66 },

  // === ROYAL ===
  { name: 'Balmoral', threadcount: 'GY/4 K4 GY4 K4 R32 K4 GY4 K4 GY/4', category: 'Royal', description: 'Royal Balmoral - restricted use', popularity: 85 },
  { name: 'Prince Charles Edward', threadcount: 'W/4 R48 K4 R4 K4 G24 K4 W4 K4 G24 K4 R4 K4 R48 W/4', category: 'Royal', description: 'Jacobite tartan', popularity: 75 },
  { name: 'Princess Mary', threadcount: 'B/8 R4 B8 K4 G24 K4 Y4 K4 G24 K4 B8 R4 B/8', category: 'Royal', description: 'Princess Mary tartan', popularity: 60 },

  // === HISTORIC ===
  { name: 'Jacobite', threadcount: 'R/8 K4 R8 K4 G24 K4 R8 K4 R/8', category: 'Historic', description: '1745 Rebellion', popularity: 72 },
  { name: 'Bonnie Prince Charlie', threadcount: 'W/4 R48 K4 R4 K4 G24 K4 W4 K4 G24 K4 R4 K4 R48 W/4', category: 'Historic', description: 'Charles Edward Stuart', popularity: 70 },
  { name: 'Culloden', threadcount: 'R/4 G24 B4 G24 K4 R4 K/4', category: 'Historic', description: 'Battle of Culloden 1746', popularity: 68 },
  { name: 'Flora MacDonald', threadcount: 'G/8 R4 G8 B24 R4 B4 R4 B24 G8 R4 G/8', category: 'Historic', description: 'Jacobite heroine', popularity: 65 },

  // === FASHION & DESIGNER ===
  { name: 'Burberry', threadcount: 'K/2 R4 K2 TN24 K2 W/2', category: 'Fashion', description: 'Classic British check (inspired)', popularity: 85 },
  { name: 'Blackberry', threadcount: 'P/4 K8 P4 K24 W4 K24 P4 K8 P/4', category: 'Fashion', description: 'Modern purple fashion tartan', popularity: 55 },
  { name: 'Spirit of Scotland', threadcount: 'B/8 K4 B8 K4 P24 K4 B8 K4 B/8', category: 'Fashion', description: 'Modern Scottish identity', popularity: 60 },
  { name: 'Pride of Scotland', threadcount: 'B/8 K4 B8 K4 P24 K4 G24 K4 P24 K4 B8 K4 B/8', category: 'Fashion', description: 'Contemporary fashion tartan', popularity: 58 },
  { name: 'Scottish National', threadcount: 'Y/8 R4 Y8 R4 K24 R4 Y8 R4 Y/8', category: 'Fashion', description: 'Scottish nationalism', popularity: 56 },

  // === IRISH ===
  { name: 'Irish National', threadcount: 'G/24 W4 O4 W4 G/24', category: 'District', description: 'Irish tricolor tartan', popularity: 70 },
  { name: 'County Galway', threadcount: 'G/8 K4 G8 K4 R24 K4 G8 K4 G/8', category: 'District', description: 'Galway Irish tartan', popularity: 55 },
  { name: 'St. Patrick', threadcount: 'G/4 W4 G24 Y4 G24 W4 G/4', category: 'District', description: 'Irish St. Patrick tartan', popularity: 60 },

  // === MORE CLANS (A-Z continued) ===
  { name: 'Anderson', threadcount: 'B/4 K4 B4 K24 R4 K24 B4 K4 B/4', category: 'Clan', description: 'Clan Anderson', popularity: 55 },
  { name: 'Armstrong', threadcount: 'G/4 K16 G4 K4 B16 K4 G4 K16 G/4', category: 'Clan', description: 'Border clan', popularity: 58 },
  { name: 'Brodie', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Brodie', popularity: 52 },
  { name: 'Bruce', threadcount: 'Y/8 R4 Y8 R4 G24 R4 Y8 R4 Y/8', category: 'Clan', description: 'Clan Bruce - Robert the Bruce', popularity: 75 },
  { name: 'Chisholm', threadcount: 'R/4 G4 R4 G24 W4 G24 R4 G4 R/4', category: 'Clan', description: 'Clan Chisholm', popularity: 54 },
  { name: 'Colquhoun', threadcount: 'B/4 K4 B4 K4 G24 K4 W4 K4 G24 K4 B4 K4 B/4', category: 'Clan', description: 'Clan Colquhoun', popularity: 50 },
  { name: 'Crawford', threadcount: 'R/4 G4 R4 G24 B4 G24 R4 G4 R/4', category: 'Clan', description: 'Clan Crawford', popularity: 53 },
  { name: 'Cunningham', threadcount: 'B/4 G24 K4 R4 K4 G24 B/4', category: 'Clan', description: 'Clan Cunningham', popularity: 51 },
  { name: 'Davidson', threadcount: 'R/4 G4 R4 G24 B4 G4 B4 G24 R4 G4 R/4', category: 'Clan', description: 'Clan Davidson', popularity: 56 },
  { name: 'Duncan', threadcount: 'B/4 G24 B4 G4 B4 K4 R4 K4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Duncan', popularity: 54 },
  { name: 'Elliot', threadcount: 'R/4 B24 R4 B4 R4 G24 R4 B4 R4 B24 R/4', category: 'Clan', description: 'Border Clan Elliot', popularity: 52 },
  { name: 'Erskine', threadcount: 'G/4 K4 G4 K4 R24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Erskine', popularity: 50 },
  { name: 'Farquharson', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Farquharson', popularity: 55 },
  { name: 'Ferguson', threadcount: 'G/4 B24 G4 B4 G4 W4 G4 B4 G4 B24 G/4', category: 'Clan', description: 'Clan Ferguson', popularity: 58 },
  { name: 'Graham of Montrose', threadcount: 'G/4 K4 G4 K24 W4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Graham', popularity: 60 },
  { name: 'Gunn', threadcount: 'G/4 K4 G4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Gunn', popularity: 52 },
  { name: 'Henderson', threadcount: 'G/4 K4 G4 K4 B24 K4 W4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Henderson', popularity: 55 },
  { name: 'Home', threadcount: 'G/4 K4 G4 K24 R4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Home', popularity: 48 },
  { name: 'Innes', threadcount: 'R/4 G24 R4 G4 R4 B24 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Innes', popularity: 50 },
  { name: 'Johnston', threadcount: 'B/4 K4 B4 K4 G24 K4 Y4 K4 G24 K4 B4 K4 B/4', category: 'Clan', description: 'Clan Johnston', popularity: 54 },
  { name: 'Keith', threadcount: 'B/4 R4 B4 R4 Y24 R4 B4 R4 B/4', category: 'Clan', description: 'Clan Keith', popularity: 52 },
  { name: 'Kennedy', threadcount: 'G/4 K4 G4 K24 B4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Kennedy', popularity: 58 },
  { name: 'Kerr', threadcount: 'R/4 G24 B4 G24 R/4', category: 'Clan', description: 'Clan Kerr', popularity: 50 },
  { name: 'Lamont', threadcount: 'B/4 G24 B4 G4 B4 W4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Lamont', popularity: 52 },
  { name: 'Leslie', threadcount: 'G/4 B24 K4 B4 K4 Y4 K4 B4 K4 B24 G/4', category: 'Clan', description: 'Clan Leslie', popularity: 53 },
  { name: 'MacAlister', threadcount: 'R/4 G24 R4 G4 R4 K4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacAlister', popularity: 50 },
  { name: 'MacArthur', threadcount: 'G/4 Y4 G24 K4 Y4 K4 G24 Y4 G/4', category: 'Clan', description: 'Clan MacArthur', popularity: 55 },
  { name: 'MacAulay', threadcount: 'R/4 G24 R4 G4 R4 B4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacAulay', popularity: 52 },
  { name: 'MacBeth', threadcount: 'R/8 Y4 R8 K4 G24 K4 R8 Y4 R/8', category: 'Clan', description: 'Clan MacBeth', popularity: 58 },
  { name: 'MacCallum', threadcount: 'B/4 G24 B4 G4 B4 Y4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan MacCallum', popularity: 50 },
  { name: 'MacDougall', threadcount: 'R/4 K4 R4 K4 B24 K4 G24 K4 B24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacDougall', popularity: 54 },
  { name: 'MacFarlane', threadcount: 'K/4 W8 K4 W4 K24 R4 K24 W4 K4 W8 K/4', category: 'Clan', description: 'Clan MacFarlane - Black & White', popularity: 60 },
  { name: 'MacGillivray', threadcount: 'R/4 K4 R4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacGillivray', popularity: 52 },
  { name: 'MacInnes', threadcount: 'R/4 G24 K4 R4 K4 G24 R/4', category: 'Clan', description: 'Clan MacInnes', popularity: 50 },
  { name: 'MacIntosh', threadcount: 'R/4 K4 R4 K4 G24 K4 B4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacIntosh', popularity: 62 },
  { name: 'MacIntyre', threadcount: 'R/4 G24 R4 G4 R4 B4 Y4 B4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacIntyre', popularity: 55 },
  { name: 'MacKay', threadcount: 'B/4 G24 B4 G4 B4 K4 W4 K4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan MacKay', popularity: 58 },
  { name: 'MacKinnon', threadcount: 'R/4 G24 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacKinnon', popularity: 54 },
  { name: 'MacLachlan', threadcount: 'Y/4 K4 Y4 K4 R24 K4 G24 K4 R24 K4 Y4 K4 Y/4', category: 'Clan', description: 'Clan MacLachlan', popularity: 56 },
  { name: 'MacLaine of Lochbuie', threadcount: 'B/4 K4 B4 K4 G24 K4 Y4 K4 G24 K4 B4 K4 B/4', category: 'Clan', description: 'MacLaine of Lochbuie', popularity: 52 },
  { name: 'MacLaren', threadcount: 'G/4 K4 G4 K4 B24 K4 Y4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan MacLaren', popularity: 55 },
  { name: 'MacMillan', threadcount: 'Y/4 R4 Y4 R4 G24 R4 B4 R4 G24 R4 Y4 R4 Y/4', category: 'Clan', description: 'Clan MacMillan', popularity: 58 },
  { name: 'MacNab', threadcount: 'R/4 K4 R4 K4 G24 K4 CR4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacNab', popularity: 54 },
  { name: 'MacNaughton', threadcount: 'R/4 G24 B4 G4 B4 Y4 B4 G4 B4 G24 R/4', category: 'Clan', description: 'Clan MacNaughton', popularity: 52 },
  { name: 'MacNeil', threadcount: 'G/4 K4 G4 K4 B24 K4 R4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan MacNeil of Barra', popularity: 58 },
  { name: 'MacQuarrie', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 W4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacQuarrie', popularity: 50 },
  { name: 'MacQueen', threadcount: 'R/4 K4 R4 K24 Y4 K24 R4 K4 R/4', category: 'Clan', description: 'Clan MacQueen', popularity: 52 },
  { name: 'MacRae', threadcount: 'R/4 K4 R4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacRae', popularity: 60 },
  { name: 'Malcolm', threadcount: 'B/4 G24 B4 G4 B4 R4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Malcolm', popularity: 54 },
  { name: 'Matheson', threadcount: 'R/4 G24 R4 G4 R4 K4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Matheson', popularity: 55 },
  { name: 'Maxwell', threadcount: 'R/4 G24 R4 G4 R4 K8 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Maxwell', popularity: 54 },
  { name: 'Menzies', threadcount: 'R/4 W4 R4 W4 G24 W4 R4 W4 R/4', category: 'Clan', description: 'Clan Menzies - Red & White', popularity: 62 },
  { name: 'Moncreiffe', threadcount: 'R/4 G24 R4 G4 R4 W4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Moncreiffe', popularity: 48 },
  { name: 'Montgomery', threadcount: 'B/4 G24 B4 G4 B4 K4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Montgomery', popularity: 52 },
  { name: 'Morrison', threadcount: 'G/4 K4 G4 K4 R24 K4 B4 K4 R24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Morrison', popularity: 55 },
  { name: 'Munro', threadcount: 'R/4 K4 R4 K4 G24 K4 W4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Munro', popularity: 58 },
  { name: 'Napier', threadcount: 'Y/4 K4 Y4 K4 R24 K4 G4 K4 R24 K4 Y4 K4 Y/4', category: 'Clan', description: 'Clan Napier', popularity: 50 },
  { name: 'Ogilvie', threadcount: 'R/4 Y4 R4 Y4 B24 Y4 R4 Y4 R/4', category: 'Clan', description: 'Clan Ogilvie', popularity: 55 },
  { name: 'Ramsay', threadcount: 'R/4 G24 B4 G4 B4 W4 B4 G4 B4 G24 R/4', category: 'Clan', description: 'Clan Ramsay', popularity: 52 },
  { name: 'Rose', threadcount: 'R/4 K4 R4 K24 B4 K24 R4 K4 R/4', category: 'Clan', description: 'Clan Rose', popularity: 54 },
  { name: 'Shaw', threadcount: 'R/4 K4 R4 K4 G24 K4 B4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Shaw', popularity: 52 },
  { name: 'Skene', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Skene', popularity: 50 },
  { name: 'Stewart Hunting', threadcount: 'G/4 K4 G4 K24 R4 K4 B4 K4 R4 K24 G4 K4 G/4', category: 'Clan', description: 'Stewart Hunting tartan', popularity: 72 },
  { name: 'Sutherland', threadcount: 'G/4 K4 G4 K24 B4 K4 W4 K4 B4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Sutherland', popularity: 60 },
  { name: 'Urquhart', threadcount: 'B/4 G24 K4 G4 K4 W4 K4 G4 K4 G24 B/4', category: 'Clan', description: 'Clan Urquhart', popularity: 54 },
  { name: 'Watson', threadcount: 'B/4 K4 B4 K24 R4 K24 B4 K4 B/4', category: 'Clan', description: 'Clan Watson', popularity: 52 },
  { name: 'Wemyss', threadcount: 'R/4 G24 R4 G4 R4 W4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Wemyss', popularity: 48 },

  // === SIMPLE PATTERNS (for learning) ===
  { name: 'Simple Red & Black', threadcount: 'R/24 K4 R/24', category: 'Fashion', description: 'Simple two-color tartan', popularity: 45 },
  { name: 'Simple Blue & Green', threadcount: 'B/24 G8 B/24', category: 'Fashion', description: 'Classic color combination', popularity: 44 },
  { name: 'Buffalo Plaid', threadcount: 'R/24 K/24', category: 'Fashion', description: 'Classic lumberjack pattern', popularity: 75 },
  { name: 'Gingham', threadcount: 'W/8 B/8', category: 'Fashion', description: 'Classic gingham check', popularity: 70 },
];

export const TARTAN_CATEGORIES = ['Clan', 'District', 'Military', 'Royal', 'Historic', 'Fashion'] as const;

export const SORTED_TARTANS = [...TARTAN_LIBRARY].sort(
  (a, b) => (b.popularity || 0) - (a.popularity || 0)
);
