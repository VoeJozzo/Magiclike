// CARDS — templates keyed by engine ID. Keys may not match name (bolt =
// Lightning Bolt). Keys are internal but persist in saves/PICKLOG — renames
// need save migration.
const CARDS = {
  plains:   {name:'Plains',   type:'Land', sub:'Basic Land', art:'⛰', mana:'W'},
  island:   {name:'Island',   type:'Land', sub:'Basic Land', art:'🌊', mana:'U'},
  swamp:    {name:'Swamp',    type:'Land', sub:'Basic Land', art:'☠', mana:'B'},
  mountain: {name:'Mountain', type:'Land', sub:'Basic Land', art:'🌋', mana:'R'},
  forest:   {name:'Forest',   type:'Land', sub:'Basic Land', art:'🌲', mana:'G'},
  cityOfBrass: {name:'City of Brass', type:'Land', sub:'Land', art:'🏛', mana:'W',
                extraManaColors:['U','B','R','G'],
                text:'Tap: Add one mana of any color.'},

  // ─────────── WHITE ───────────
  savannahLions: {name:'Savannah Lions', type:'Creature', sub:'Cat',     cost:{W:1},     power:2, toughness:1, art:'🦁'},
  whiteKnight:   {name:'White Knight',   type:'Creature', sub:'Human Knight',  cost:{W:2},     power:2, toughness:2, art:'⚔', text:'First strike', keywords:['firstStrike']},
  ancestralGuard:{name:'Devoted Watcher',type:'Creature', sub:'Human Soldier', cost:{W:1,C:1}, power:1, toughness:3, art:'🛡', text:'Vigilance', keywords:['vigilance']},
  serra:         {name:'Serra Angel',    type:'Creature', sub:'Angel',   cost:{W:2,C:3}, power:4, toughness:4, art:'😇', text:'Flying, Vigilance', keywords:['flying','vigilance']},
  cloudGiant:    {name:'Cloud Pegasus',  type:'Creature', sub:'Pegasus', cost:{W:1,C:2}, power:2, toughness:2, art:'🦄', text:'Flying',  keywords:['flying']},

  salve:         {name:'Healing Salve',  type:'Instant',  cost:{W:1},    art:'✨', text:'Target player gains 3 life.', effects:[{kind:'gainLife', target:'player', amount:3}]},
  pacifism:      {name:'Pacifism',       type:'Sorcery',  cost:{W:1,C:1},art:'🕊', text:"Target creature can't attack or block.", effects:[{kind:'restrict', target:'creature', cantAttack:true, cantBlock:true}]},
  swords:        {name:'Swords to Plowshares', type:'Instant', cost:{W:1}, art:'🌾', text:"Exile target creature; its controller gains life equal to its power.", effects:[{kind:'removeCreature', severity:4, target:'creature'}, {kind:'gainLife', target:'creature', who:{from:'targetController'}, amount:{from:'targetPower'}}]},
  divineFavor:   {name:'Divine Favor',   type:'Instant',  cost:{W:1,C:1},art:'☀', text:'Target creature gets +1/+3 EOT.', effects:[{kind:'pump', target:'creature', power:1, toughness:3}]},
  wrathOfGod:    {name:'Day of Reckoning', type:'Sorcery', cost:{W:2,C:3}, art:'⛅', text:'Destroy all creatures.',         effects:[{kind:'removeAll', severity:3}]},

  // ─────────── BLUE ───────────
  merfolk:       {name:'Merfolk Looter', type:'Creature', sub:'Merfolk', cost:{U:1},    power:1, toughness:1, art:'🐟', text:'T: Draw a card, then discard a card.',
                  abilities:[{cost:{tap:true}, sorcerySpeed:false, effects:[{kind:'draw', amount:1}, {kind:'discard', target:'self', amount:1}]}]},
  prodigal:      {name:'Prodigal Sorcerer', type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:1, toughness:1, art:'🧙', text:'T: Deal 1 damage to any target.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'damage', target:'any', amount:1}]}]},
  phantomWarrior:{name:'Phantom Warrior',type:'Creature', sub:'Spirit',  cost:{U:1,C:2},power:2, toughness:2, art:'👻', text:'Unblockable', keywords:['unblockable']},
  airel:         {name:'Air Elemental',  type:'Creature', sub:'Elemental',cost:{U:2,C:3},power:4, toughness:4, art:'💨', text:'Flying', keywords:['flying']},
  mahamoti:      {name:'Mahamoti Djinn', type:'Creature', sub:'Djinn',   cost:{U:2,C:4},power:5, toughness:6, art:'🌀', text:'Flying', keywords:['flying']},

  counter:       {name:'Counterspell',   type:'Instant',  cost:{U:2},    art:'🚫', text:'Counter target spell.', effects:[{kind:'counter', target:'spell'}]},
  unsummon:      {name:'Unsummon',       type:'Instant',  cost:{U:1},    art:'↩', text:"Return target creature to its owner's hand.", effects:[{kind:'removeCreature', severity:2, target:'creature'}]},
  divin:         {name:'Divination',     type:'Sorcery',  cost:{U:1,C:1},art:'📖', text:'Draw 2 cards.',  effects:[{kind:'draw', amount:2}]},
  preorder:      {name:'Preordain',      type:'Sorcery',  cost:{U:1},    art:'🔮', text:'Draw a card.',   effects:[{kind:'draw', amount:1}]},
  mindControl:   {name:'Mind Control',   type:'Sorcery',  cost:{U:2,C:2},art:'🧠', text:"Gain control of target creature.",
                  effects:[{kind:'gainControl', target:'creature', filter:{controller:'opp'}}]},

  // ─────────── BLACK ───────────
  bloodBat:      {name:'Vampire Bat',    type:'Creature', sub:'Bat',     cost:{B:1},    power:1, toughness:1, art:'🦇', text:'Flying', keywords:['flying']},
  rakdosCadet:   {name:'Rakdos Cadet',   type:'Creature', sub:'Imp',     cost:{B:1,C:1},power:2, toughness:2, art:'👹'},
  assassin:      {name:'Royal Assassin', type:'Creature', sub:'Human Assassin',cost:{B:1,C:1},power:1, toughness:1, art:'🥷', text:'T: Destroy target tapped creature.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'removeCreature', severity:3, target:'creature', filter:{tapped:true}}]}]},
  hypnotic:      {name:'Hypnotic Specter', type:'Creature', sub:'Specter', cost:{B:2,C:1},power:2, toughness:2, art:'😱', text:'Flying. When this attacks, target opponent discards a card.', keywords:['flying'],
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, target opponent discards a card.',
                    effects: [{kind:'discard', target:'player', amount:1}],
                  }]},
  nightmare:     {name:'Sengir Vampire', type:'Creature', sub:'Vampire', cost:{B:2,C:3},power:4, toughness:4, art:'🧛', text:"Whenever a creature dealt damage by this dies, put a +1/+1 counter on this.", keywords:['flying','lifelink'],
                  triggers:[{
                    event: 'cardDies',
                    // Canonical Sengir: only fires when the dying creature was
                    // dealt damage by ~ this turn. damagedBySources is populated
                    // by combat & spell damage and cleared at end of turn.
                    condId: 'thisKillsCreature',
                    text: 'A creature ~ damaged died — put a +1/+1 counter on ~.',
                    effects: [{kind:'addCounter', target:'self', power:1, toughness:1}],
                  }]},
  archdemonBargains: {name:'Archdemon of Bargains', type:'Creature', sub:'Demon', cost:{B:2,C:3}, power:5, toughness:5, art:'👹', special: true, keywords:['flying','trample'],
                  text:'Flying, Trample. When this enters, you choose a number from 1 to 5; put that many stickers on permanents this controls. When this leaves play, put that many stickers on permanents you control.',
                  triggers:[
                    {
                      event: 'cardEntersBattlefield',
                      condId: 'thisEnters',
                      text: 'When ~ enters, you choose 1-5: put that many stickers on permanents ~\'s controller has.',
                      effects: [{kind:'bargainStickerSelf'}],
                    },
                    {
                      event: 'cardLeavesBattlefield',
                      condId: 'thisLeaves',
                      text: 'When ~ leaves play, put N stickers on the opposing player\'s permanents (N = chosen number).',
                      effects: [{kind:'bargainStickerOther'}],
                    },
                  ]},

  ritual:        {name:'Dark Ritual',    type:'Instant',  cost:{B:1},    art:'🕯', text:'Add {B}{B}{B}.', effects:[{kind:'addMana', amounts:{B:3}}]},
  doomBlade:     {name:'Doom Blade',     type:'Instant',  cost:{B:1,C:1},art:'🗡', text:'Destroy target non-Black creature.', effects:[{kind:'removeCreature', severity:3, target:'creature', filter:{notColor:'B'}}]},
  terror:        {name:'Murder',         type:'Instant',  cost:{B:1,C:2},art:'🗡', text:'Destroy target creature.', effects:[{kind:'removeCreature', severity:3, target:'creature'}]},
  mindrot:       {name:'Mind Rot',       type:'Sorcery',  cost:{B:1,C:1},art:'🧠', text:'Target player discards 2.', effects:[{kind:'discard', target:'player', amount:2}]},
  drainLife:     {name:'Drain Life',     type:'Sorcery',  cost:{B:1,C:2},art:'🩸', text:'Deal 3 damage to any target. You gain 3 life.', effects:[{kind:'damage', target:'any', amount:3}, {kind:'gainLife', target:'self', amount:3}]},

  // ─────────── RED ───────────
  goblinRaider:  {name:'Goblin Raider',  type:'Creature', sub:'Goblin Warrior',  cost:{R:1},    power:2, toughness:1, art:'👺'},
  hastyOgre:     {name:'Raging Goblin',  type:'Creature', sub:'Goblin Berserker',  cost:{R:1},    power:1, toughness:1, art:'😡', text:'Haste',     keywords:['haste']},
  fireImp:       {name:'Cinder Sprite',  type:'Creature', sub:'Imp',     cost:{R:1,C:1},power:1, toughness:1, art:'🔥', text:'Flying, Haste', keywords:['flying','haste']},
  bloodlust:     {name:'Bloodlust Berserker', type:'Creature', sub:'Goblin Berserker', cost:{R:1,C:2}, power:3, toughness:2, art:'⚒',
                  text:'Haste. When this attacks, if an opponent has lost life this turn, it gets +1/+1 EOT.',
                  keywords:['haste'],
                  triggers:[{
                    event: 'attacks',
                    // Bloodlust condition: self is the attacker AND the opp
                    // (from self's controller's perspective) has lost any
                    // life this turn. Uses ENGINE.state() to read the
                    // per-turn life-loss tracker — the condition fn lives
                    // outside the ENGINE IIFE so direct G access isn't
                    // available, but the public state() accessor is.
                    condId: 'thisAttacksAfterOppLifeLoss',
                    text: 'When ~ attacks (if opp lost life), it gets +1/+1 EOT.',
                    effects: [{kind:'pump', target:'self', power:1, toughness:1}],
                  }]},
  dragon:        {name:'Shivan Dragon',  type:'Creature', sub:'Dragon',  cost:{R:2,C:4},power:5, toughness:5, art:'data:image/png;base64,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', text:'Flying. {R}: this gets +1/+0 EOT.',
                  keywords:['flying'],
                  abilities:[{cost:{mana:{R:1}}, effects:[{kind:'pump', target:'self', power:1, toughness:0}]}]},

  bolt:          {name:'Lightning Bolt', type:'Instant',  cost:{R:1},    art:'⚡', text:'Deal 3 damage to any target.', effects:[{kind:'damage', target:'any', amount:3}]},
  shock:         {name:'Shock',          type:'Instant',  cost:{R:1},    art:'💥', text:'Deal 2 damage to any target.', effects:[{kind:'damage', target:'any', amount:2}]},
  incinerate:    {name:'Char',           type:'Instant',  cost:{R:1,C:1},art:'🔥', text:'Char deals 4 damage to any target and 1 damage to you.', effects:[{kind:'damage', target:'any', amount:4}, {kind:'damage', target:'self', amount:1}]},
  firebreathing: {name:'Firebreathing',  type:'Instant',  cost:{R:1},    art:'🌶', text:'Target creature gets +3/+0 EOT.', effects:[{kind:'pump', target:'creature', power:3, toughness:0}]},
  fireball:      {name:'Volcanic Hammer',type:'Sorcery',  cost:{R:1,C:2},art:'🔨', text:'Deal 4 damage to any target.', effects:[{kind:'damage', target:'any', amount:4}]},
  pyroclasm:     {name:'Pyroclasm',      type:'Sorcery',  cost:{R:1,C:1},art:'🌋', text:'Deal 2 damage to each creature.', effects:[{kind:'damageAll', amount:2}]},
  angerOfGods:   {name:'Anger of the Gods', type:'Sorcery', cost:{R:2,C:1}, art:'⛈', text:'Deal 3 damage to each creature.', effects:[{kind:'damageAll', amount:3}]},
  furnaceRoar:   {name:'Furnace Roar',   type:'Sorcery',  cost:{R:2,C:3}, art:'🔥', text:'Deal 5 damage to each creature.', effects:[{kind:'damageAll', amount:5}]},
  goblinRabble:  {name:'Goblin Rabble',  type:'Sorcery',  cost:{R:1,C:2}, art:'👹', text:'Create three 1/1 red Goblin tokens with haste.', effects:[{kind:'createTokens', tokenId:'goblin_r_1_1', count:3}]},
  threaten:      {name:'Threaten',       type:'Sorcery',  cost:{R:1,C:2}, art:'😈', text:"Gain control of target creature until end of turn. Untap it. It gains haste until end of turn.",
                  effects:[{kind:'gainControl', target:'creature', filter:{controller:'opp'}, duration:'eot', grantHaste:true, untap:true}]},

  // ─────────── GREEN ───────────
  elves:         {name:'Llanowar Elves', type:'Creature', sub:'Elf Druid', cost:{G:1}, power:1, toughness:1, art:'🧝', text:'T: Add {G}.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'addMana', amounts:{G:1}}]}]},
  bears:         {name:'Grizzly Bears',  type:'Creature', sub:'Bear',    cost:{G:1},    power:2, toughness:2, art:'🐻'},
  spider:        {name:'Giant Spider',   type:'Creature', sub:'Spider',  cost:{G:1,C:2},power:2, toughness:4, art:'🕷', text:'Reach', keywords:['reach']},
  rhox:          {name:'Centaur Courser',type:'Creature', sub:'Centaur', cost:{G:1,C:2},power:3, toughness:3, art:'🐎'},
  wurm:          {name:'Craw Wurm',      type:'Creature', sub:'Wurm',    cost:{G:2,C:4},power:6, toughness:4, art:'🐍', text:'Trample', keywords:['trample']},

  growth:        {name:'Giant Growth',   type:'Instant',  cost:{G:1},    art:'💪', text:'Target creature gets +3/+3 EOT.', effects:[{kind:'pump', target:'creature', power:3, toughness:3}]},
  rampant:       {name:'Rampant Growth', type:'Sorcery',  cost:{G:1,C:1},art:'🌱', text:'Search library for a basic land; put it onto battlefield tapped.', effects:[{kind:'searchLandTapped'}]},
  naturalize:    {name:'Choking Vines',  type:'Instant',  cost:{G:1,C:1},art:'🌿', text:'Destroy target creature with flying.', effects:[{kind:'removeCreature', severity:3, target:'creature', filter:{controller:'opp', hasKeyword:'flying'}}]},
  tutor:         {name:'Worldly Tutor',  type:'Sorcery',  cost:{G:1},    art:'🔍', text:'Search your library for a creature card; put it into your hand.', effects:[{kind:'searchCreature'}]},

  // ========================================================================
  // EXPANSION SET — additional cards (v0.38). ~10 per color.
  // ========================================================================

  // ─────────── WHITE expansion ───────────
  benalishHero:  {name:'Benalish Hero',   type:'Creature', sub:'Human Soldier', cost:{W:1},     power:1, toughness:1, art:'🪖', text:'Vigilance', keywords:['vigilance']},
  squireOath:    {name:'Squire of Oaths', type:'Creature', sub:'Human Soldier', cost:{W:1,C:1}, power:2, toughness:3, art:'⚜', text:'A devoted defender.'},
  paladinValor:  {name:'Paladin of Valor',type:'Creature', sub:'Human Knight',  cost:{W:1,C:3}, power:3, toughness:4, art:'🛡', text:'Vigilance', keywords:['vigilance']},
  ageOfDawn:     {name:'Dawn Sentinel',   type:'Creature', sub:'Spirit',  cost:{W:2,C:2}, power:2, toughness:5, art:'☁', text:'Flying', keywords:['flying']},
  righteousCavalry:{name:'Righteous Cavalry', type:'Creature', sub:'Human Knight', cost:{W:2,C:2}, power:4, toughness:3, art:'🐴'},
  oblation:      {name:'Oblation',        type:'Instant',  cost:{W:1,C:2}, art:'🕊', text:"Shuffle target creature into its owner's library.", effects:[{kind:'shuffleIntoLibrary', target:'creature'}]},
  blessedReprieve:{name:'Healing Light',  type:'Instant', cost:{W:1,C:1}, art:'🌟', text:'Target player gains 5 life.', effects:[{kind:'gainLife', target:'player', amount:5}]},
  mightOfFaith: {name:'Might of Faith',   type:'Instant',  cost:{W:1},    art:'✋', text:'Target creature gets +2/+2 EOT.', effects:[{kind:'pump', target:'creature', power:2, toughness:2}]},
  smite:        {name:'Smite the Wicked', type:'Sorcery', cost:{W:1,C:2}, art:'⚡', text:'Destroy target tapped creature.', effects:[{kind:'removeCreature', severity:3, target:'creature', filter:{tapped:true}}]},
  rallyTroops:  {name:'Rally the Troops', type:'Sorcery', cost:{W:1,C:1}, art:'📯', text:'Creatures you control get +1/+1 EOT.', effects:[{kind:'pumpAllYours', power:1, toughness:1}]},
  raiseAlarm:   {name:'Raise the Alarm',  type:'Instant',  cost:{W:1,C:1}, art:'🚨', text:'Create two 1/1 white Soldier tokens.', effects:[{kind:'createTokens', tokenId:'soldier_w_1_1', count:2}]},
  spectralProcession:{name:'Spectral Procession', type:'Sorcery', cost:{W:3}, art:'👻', text:'Create three 1/1 white Spirit tokens with flying.', effects:[{kind:'createTokens', tokenId:'spirit_w_1_1', count:3}]},
  aerialManeuver:{name:'Aerial Maneuver', type:'Instant', cost:{W:2,C:1}, art:'🕊', text:'Creatures you control gain flying until end of turn.', effects:[{kind:'grantKeyword', whose:'allYours', keyword:'flying', duration:'eot'}]},
  cloudshift:    {name:'Cloudshift',       type:'Instant',  cost:{W:1}, art:'☁',  text:'Exile target creature you control, then return it to the battlefield.', effects:[{kind:'flicker', target:'creature', filter:{controller:'self'}}]},
  otherworldlyJourney:{name:'Otherworldly Journey', type:'Instant', cost:{W:1,C:1}, art:'🌌', text:'Exile target creature; return it at end of turn.', effects:[{kind:'exileUntilEOT', target:'creature'}]},
  // First modal card. Three modes — burn, combat trick, value/stabilization —
  // demonstrating the "choose one" mechanic. modeNames are shown to the
  // player in the mode-picker UI and in the cast log, so they should be
  // short and disambiguating. The order of modes matters for default-mode
  // expectations: most-common-use first if there's a clear winner.
  crusadersCharm: {
    name:"Crusader's Charm",
    type:'Instant',
    cost:{W:2,C:1},
    art:'✚',
    text:"Choose one — Deal 2 damage to any target; or target creature gets +2/+2 until end of turn; or you gain 3 life and draw a card.",
    effects: {
      modeNames: ['Smite (deal 2)', 'Embolden (+2/+2 EOT)', 'Sanctuary (gain 3, draw 1)'],
      modes: [
        [{kind:'damage', target:'any', amount:2}],
        [{kind:'pump', target:'creature', power:2, toughness:2}],
        [{kind:'gainLife', target:'self', amount:3}, {kind:'draw', amount:1}],
      ],
    },
  },

  // ─────────── BLUE expansion ───────────
  scryWizard:    {name:'Scrying Wizard',  type:'Creature', sub:'Human Wizard',  cost:{U:1,C:1}, power:1, toughness:2, art:'🔮', text:'T: Draw a card, then discard a card.',
                  abilities:[{cost:{tap:true}, sorcerySpeed:false, effects:[{kind:'draw', amount:1}, {kind:'discard', target:'self', amount:1}]}]},
  illusionDrake:{name:'Illusion Drake',  type:'Creature', sub:'Drake',   cost:{U:1,C:2}, power:3, toughness:2, art:'🐉', text:'Flying', keywords:['flying']},
  mistDjinn:    {name:'Mist Djinn',      type:'Creature', sub:'Djinn',   cost:{U:1,C:3}, power:3, toughness:4, art:'🌫', text:'Flying', keywords:['flying']},
  archmage:     {name:'Archmage of Veils',type:'Creature',sub:'Human Wizard',  cost:{U:2,C:2}, power:2, toughness:4, art:'🧙‍♂', text:'T: Draw a card.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'draw', amount:1}]}]},
  windDancer:   {name:'Wind Dancer',     type:'Creature', sub:'Faerie',  cost:{U:1},     power:1, toughness:1, art:'🧚', text:'Flying', keywords:['flying']},
  studiousResearch:{name:'Studious Research', type:'Sorcery', cost:{U:1,C:2}, art:'📚', text:'Draw 3 cards, then discard 1 card.', effects:[{kind:'draw', amount:3}, {kind:'discard', target:'self', amount:1}]},
  freezeMoment: {name:'Freeze Moment',   type:'Instant',  cost:{U:1},    art:'❄', text:'Tap target creature.', effects:[{kind:'removeCreature', severity:1, target:'creature'}]},
  awakenStone:  {name:'Awaken the Stone',type:'Instant',  cost:{U:1},    art:'⏰', text:'Untap target creature.', effects:[{kind:'untap', target:'creature'}]},
  veilOfMists:  {name:'Veil of Mists',   type:'Instant',  cost:{U:1,C:1}, art:'💨', text:"Return target creature to its owner's hand.", effects:[{kind:'removeCreature', severity:2, target:'creature'}]},
  arcaneDenial: {name:'Arcane Denial',   type:'Instant',  cost:{U:1,C:2}, art:'🚫', text:'Counter target spell. You draw a card.', effects:[{kind:'counter', target:'spell'}, {kind:'draw', amount:1}]},
  washAway:     {name:'Wash Away',       type:'Sorcery',  cost:{U:1,C:2}, art:'🌊', text:"Return all creatures to their owners' hands.", effects:[{kind:'removeAll', severity:2, whose:'all'}]},
  devastationTide:{name:'Devastation Tide', type:'Sorcery', cost:{U:2,C:3}, art:'🌀', text:"Return all creatures your opponent controls to their owner's hand.", effects:[{kind:'removeAll', severity:2, whose:'opp'}]},
  tideCharm: {
    name:"Tide Charm",
    type:'Instant',
    cost:{U:1,C:2},
    art:'🌊',
    text:"Choose one — Counter target spell; or return target creature to its owner's hand; or draw 2 cards.",
    effects: {
      modeNames: ['Counter (target spell)', 'Bounce (target creature)', 'Foresee (draw 2)'],
      modes: [
        [{kind:'counter', target:'spell'}],
        [{kind:'removeCreature', severity:2, target:'creature'}],
        [{kind:'draw', amount:2}],
      ],
    },
  },

  // ─────────── BLACK expansion ───────────
  cryptRat:     {name:'Sewer Rat',       type:'Creature', sub:'Rat',     cost:{B:1},     power:2, toughness:1, art:'🐀'},
  wickedAcolyte:{name:'Wicked Acolyte',  type:'Creature', sub:'Human Cleric',  cost:{B:1,C:1}, power:2, toughness:2, art:'🧟', text:'T: Target player loses 1 life.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'damage', target:'player', amount:1}]}]},
  shadowmage:   {name:'Shadowmage',      type:'Creature', sub:'Human Wizard',  cost:{B:1,C:2}, power:2, toughness:3, art:'🌑', text:'Flying', keywords:['flying']},
  graveDigger:  {name:'Grave Digger',    type:'Creature', sub:'Zombie',  cost:{B:1,C:3}, power:3, toughness:3, art:'⚰',
                  text:'When this enters the battlefield, return target creature card from your graveyard to your hand.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, return a creature from your graveyard.',
                    effects: [{kind:'returnFromGraveyard', target:'graveyardCreature'}],
                  }]},
  abyssLurker:  {name:'Abyss Lurker',    type:'Creature', sub:'Horror',  cost:{B:2,C:3}, power:5, toughness:3, art:'👁', text:'Flying', keywords:['flying']},
  sicken:       {name:'Sicken',          type:'Instant',  cost:{B:1},    art:'🤢', text:'Target creature gets -2/-2 EOT.', effects:[{kind:'weaken', target:'creature', power:2, toughness:2}]},
  ravenousPlague:{name:'Ravenous Plague',type:'Sorcery',  cost:{B:1,C:2}, art:'☠', text:'Destroy target creature with toughness 3 or less.', effects:[{kind:'removeCreature', severity:3, target:'creature', filter:{maxTough:3}}]},
  lifeForLife:  {name:'Final Strike',    type:'Sorcery',  cost:{B:1,C:2}, art:'⚱', text:'Destroy target creature. You lose 2 life.', effects:[{kind:'removeCreature', severity:3, target:'creature'}, {kind:'damage', target:'self', amount:2}]},
  duress:       {name:'Duress',          type:'Sorcery',  cost:{B:1},    art:'😖', text:'Target opponent discards 1 card.', effects:[{kind:'discard', target:'player', amount:1}]},
  consume:      {name:'Consume Spirit',  type:'Sorcery',  cost:{B:1,C:3}, art:'🩸', text:'Deal 4 damage to any target. You gain 4 life.', effects:[{kind:'damage', target:'any', amount:4}, {kind:'gainLife', target:'self', amount:4}]},
  diabolicEdict:{name:'Diabolic Edict',  type:'Instant',  cost:{B:1,C:1}, art:'😈', text:'Target opponent sacrifices a creature.', effects:[{kind:'edict'}]},
  vileEdict:    {name:'Vile Edict',      type:'Sorcery',  cost:{B:2}, art:'🩸', text:'Target player rips a permanent they control.', special: true, effects:[{kind:'ripPermanent', target:'player'}]},
  scarification:{name:'Scarification',   type:'Sorcery',  cost:{B:2,C:1}, art:'🩸', text:'Destroy target creature. Scar it: each time it enters the battlefield, its controller loses 1 life.', special: true, effects:[{kind:'destroyAndStickerSlot', target:'creature', stickerId:'scarified'}]},
  // ─── The Balancer (mono-W boss) ─────────────────────────────────────
  // City Guardian: legendary 2/1 First Strike. Static aura: all cards
  // cost 1 more to cast. Symmetric — affects both players. Stacks: two
  // Guardians on the field = +2 to every cast cost.
  cityGuardian: {name:'City Guardian', type:'Creature', sub:'Human Soldier', cost:{W:1,C:1}, power:2, toughness:1, art:'🛡',
                 special: true, legendary: true,
                 keywords: ['first strike'],
                 staticCostBump: 1,
                 text:'Legendary, First Strike. All cards cost {1} more to cast.'},
  // Symmetricize: instant 1W. Target creature's CONTROLLER picks one of
  // its three values (power, toughness, mana cost-total) and the other
  // two become that value. Persistent across games via slot.symmetricized.
  symmetricize: {name:'Symmetricize', type:'Instant', cost:{W:1,C:1}, art:'⚖',
                 special: true,
                 text:"Target creature's controller chooses its power, toughness, or mana cost. Each becomes the same value. Forever.",
                 effects:[{kind:'symmetricize', target:'creature'}]},
  // Embargo: sorcery 1W. Return target creature to its owner's hand and
  // add +1 to its cost forever (slot.extraCost stacks).
  embargo:      {name:'Embargo', type:'Sorcery', cost:{W:1,C:1}, art:'🚫',
                 special: true,
                 text:'Return target creature to its owner\'s hand. It costs {1} more, forever.',
                 effects:[{kind:'embargo', target:'creature'}]},
  // Bleach: instant W. Exile target creature and make it colorless forever
  // (slot.colorOverride='C'). The exile happens this game; the color
  // change is the run-persistent effect (matters if/when the card is
  // recast or stolen).
  bleach:       {name:'Bleach', type:'Instant', cost:{W:1}, art:'🧴',
                 special: true,
                 text:'Exile target creature. It is colorless. Forever.',
                 effects:[{kind:'bleach', target:'creature'}]},
  carrionFeeder:{name:'Carrion Feeder',  type:'Creature', sub:'Zombie',  cost:{B:1}, power:1, toughness:1, art:'🦅',
                  text:'Sacrifice a creature: Put a +1/+1 counter on this.',
                  abilities:[{cost:{sacrifice:'creature'}, effects:[{kind:'addCounter', target:'self', power:1, toughness:1}]}]},
  bloodArtist:  {name:'Blood Artist',    type:'Creature', sub:'Vampire', cost:{B:1,C:1}, power:0, toughness:1, art:'🧛',
                  text:'Whenever a creature dies, target opponent loses 1 life and you gain 1 life.',
                  triggers:[{
                    event: 'cardDies',
                    // Fire on ANY creature dying — yours, opp's, tokens, any cause.
                    // Aristocrats payoff. Self-trigger included (Blood Artist
                    // dying triggers itself, ping for 1 + gain 1 — relevant for
                    // racing). pickBestTriggerTarget auto-picks opp face for
                    // the damage effect; gainLife auto-targets self.
                    condId: 'anyCardDies',
                    text: 'When a creature dies, opp loses 1, you gain 1.',
                    effects: [
                      {kind:'damage', target:'player', amount:1},
                      {kind:'gainLife', target:'self', amount:1},
                    ],
                  }]},
  graveCharm: {
    name:"Grave Charm",
    type:'Instant',
    cost:{B:1,C:2},
    art:'💀',
    text:"Choose one — Destroy target creature; or target opponent discards 2 cards; or you gain 4 life and that opponent loses 2 life.",
    effects: {
      modeNames: ['Slay (destroy)', 'Wither (discard 2)', 'Drain (gain 4, lose 2)'],
      modes: [
        [{kind:'removeCreature', severity:3, target:'creature'}],
        [{kind:'discard', target:'player', amount:2}],
        [{kind:'gainLife', target:'self', amount:4}, {kind:'damage', target:'player', amount:2}],
      ],
    },
  },

  // ─────────── RED expansion ───────────
  fireBrute:    {name:'Fire Brute',      type:'Creature', sub:'Goblin Berserker', cost:{R:1,C:1}, power:3, toughness:1, art:'🔥', text:'Haste', keywords:['haste']},
  emberDrake:   {name:'Ember Drake',     type:'Creature', sub:'Drake',   cost:{R:1,C:2}, power:2, toughness:2, art:'🐲', text:'Flying, Haste', keywords:['flying','haste']},
  warHorde:     {name:'War Horde',       type:'Creature', sub:'Goblin Warrior',  cost:{R:2,C:2}, power:4, toughness:3, art:'⚒'},
  inferno:      {name:'Inferno Drake',   type:'Creature', sub:'Drake',   cost:{R:2,C:3}, power:5, toughness:3, art:'🐉', text:'Flying', keywords:['flying']},
  flamewave:    {name:'Flame Lash',      type:'Sorcery',  cost:{R:1,C:2}, art:'🔥', text:'Deal 4 damage to target creature.', effects:[{kind:'damage', target:'creature', amount:4}]},
  searingBlast: {name:'Searing Blast',   type:'Sorcery',  cost:{R:2,C:2}, art:'☄', text:'Deal 5 damage to any target.', effects:[{kind:'damage', target:'any', amount:5}]},
  fieryRush:    {name:'Fiery Rush',      type:'Instant',  cost:{R:1},    art:'💨', text:'Target creature gets +2/+0 EOT.', effects:[{kind:'pump', target:'creature', power:2, toughness:0}]},
  smolder:      {name:'Faithless Looting',type:'Sorcery', cost:{R:1},    art:'📜', text:'Draw 2 cards, then discard 2 cards.', effects:[{kind:'draw', amount:2}, {kind:'discard', target:'self', amount:2}]},
  conflagrate:  {name:'Lava Spike',      type:'Sorcery',  cost:{R:1}, art:'🪨', text:'Deal 3 damage to target opponent.', effects:[{kind:'damage', target:'player', amount:3}]},
  stormCharm: {
    name:"Storm Charm",
    type:'Instant',
    cost:{R:1,C:2},
    art:'🌩',
    text:"Choose one — Deal 3 damage to any target; or target creature gets +2/+0 and gains haste until end of turn; or deal 1 damage to each creature.",
    effects: {
      modeNames: ['Bolt (deal 3)', 'Frenzy (+2/+0 haste EOT)', 'Sweep (1 to each)'],
      modes: [
        [{kind:'damage', target:'any', amount:3}],
        [{kind:'pump', target:'creature', power:2, toughness:0}, {kind:'grantKeyword', target:'creature', keyword:'haste', duration:'eot'}],
        [{kind:'damageAll', amount:1}],
      ],
    },
  },

  // ─────────── GREEN expansion ───────────
  llanowarSentry:{name:'Llanowar Sentry',type:'Creature', sub:'Elf Warrior',     cost:{G:1},     power:2, toughness:1, art:'🌿'},
  treefolk:     {name:'Treefolk Guard',  type:'Creature', sub:'Treefolk',cost:{G:1,C:2}, power:2, toughness:5, art:'🌳', text:'Reach', keywords:['reach']},
  greatStag:    {name:'Great Stag',      type:'Creature', sub:'Beast',   cost:{G:1,C:2}, power:3, toughness:4, art:'🦌'},
  forestTitan:  {name:'Forest Titan',    type:'Creature', sub:'Giant',   cost:{G:2,C:3}, power:5, toughness:5, art:'👹', text:'Trample', keywords:['trample']},
  ancientHydra: {name:'Ancient Hydra',   type:'Creature', sub:'Hydra',   cost:{G:2,C:5}, power:7, toughness:7, art:'🐲', text:'Trample', keywords:['trample']},
  primalRoar:   {name:'Primal Roar',     type:'Sorcery',  cost:{G:1,C:2}, art:'🦁', text:'Creatures you control get +2/+2 EOT.', effects:[{kind:'pumpAllYours', power:2, toughness:2}]},
  beastFight:   {name:'Beast\'s Fury',   type:'Sorcery',  cost:{G:1,C:1}, art:'🐺', text:'Your strongest creature fights target creature.', effects:[{kind:'fightTarget', target:'creature', filter:{controller:'opp'}}]},
  vinestrangle: {name:'Vine Strangle',   type:'Sorcery',  cost:{G:1,C:2}, art:'🌱', text:'Vine Strangle deals 5 damage to target creature with flying.', effects:[{kind:'damage', target:'creature', amount:5, filter:{controller:'opp', hasKeyword:'flying'}}]},
  invigorate:   {name:'Invigorate',      type:'Instant',  cost:{G:1,C:1}, art:'⚡', text:'Target creature gets +4/+4 EOT.', effects:[{kind:'pump', target:'creature', power:4, toughness:4}]},
  strengthOfPack:{name:'Strength of the Pack', type:'Instant', cost:{G:1}, art:'🐾', text:'Target creature gets +2/+2 and gains trample until end of turn.', effects:[{kind:'pump', target:'creature', power:2, toughness:2}, {kind:'grantKeyword', target:'creature', keyword:'trample', duration:'eot'}]},
  predatorsSpeed:{name:"Predator's Speed", type:'Instant', cost:{G:1}, art:'💨', text:'Target creature gains haste and trample until end of turn.', effects:[{kind:'grantKeyword', target:'creature', keyword:'haste', duration:'eot'}, {kind:'grantKeyword', target:'creature', keyword:'trample', duration:'eot'}]},
  // Multi-target cards (v1.0.15). Each effect can opt into a distinct
  // target slot via `targetSlot: N`. Effects without targetSlot share
  // slot 0 (legacy single-target behavior). Same target can be picked
  // for multiple slots — MtG explicitly allows this unless the card
  // says "different target."
  //
  // multiTarget: true excludes these from the player's draft pool until
  // the multi-step target picker UI ships. AI uses them via the auto-
  // target-picker (see scoreMultiTargetSpell).
  branchingBolt: {name:'Branching Bolt', type:'Instant', cost:{R:1,C:1}, art:'⚡', multiTarget:true, text:'Branching Bolt deals 2 damage to target creature and 2 damage to target creature.',
    effects:[
      {kind:'damage', target:'creature', amount:2},
      {kind:'damage', target:'creature', amount:2, targetSlot:1},
    ]},
  twinStrike: {name:'Twin Strike', type:'Instant', cost:{W:1}, art:'⚔', multiTarget:true, text:'Target creature gets +1/+1 and target creature gets +1/+1 until end of turn.',
    effects:[
      {kind:'pump', target:'creature', power:1, toughness:1},
      {kind:'pump', target:'creature', power:1, toughness:1, targetSlot:1},
    ]},
  rootsAndBranches: {name:'Roots and Branches', type:'Instant', cost:{G:1,C:1}, art:'🌿', multiTarget:true, text:'Tap target creature. Target creature gets +1/+1 until end of turn.',
    effects:[
      {kind:'removeCreature', severity:1, target:'creature'},
      {kind:'pump', target:'creature', power:1, toughness:1, targetSlot:1},
    ]},
  swordAndSorcery: {name:'Sword and Sorcery', type:'Instant', cost:{W:1,U:1,C:1}, art:'📜', multiTarget:true, text:'Target creature gets +2/+2 until end of turn. Tap target creature.',
    effects:[
      {kind:'pump', target:'creature', power:2, toughness:2},
      {kind:'removeCreature', severity:1, target:'creature', targetSlot:1},
    ]},
  drainLife: {name:'Drain Life', type:'Sorcery', cost:{B:1,C:2}, art:'🩸', multiTarget:true, text:'Drain Life deals 2 damage to target creature and 2 damage to target player. You gain 4 life.',
    effects:[
      {kind:'damage', target:'creature', amount:2},
      {kind:'damage', target:'player', amount:2, targetSlot:1},
      {kind:'gainLife', target:'self', amount:4},
    ]},
  overrun:      {name:'Overrun',         type:'Sorcery',  cost:{G:2,C:3}, art:'🏞', text:'Creatures you control get +3/+3 and gain trample until end of turn.', effects:[{kind:'pumpAllYours', power:3, toughness:3}, {kind:'grantKeyword', whose:'allYours', keyword:'trample', duration:'eot'}]},
  verdantCharm: {
    name:"Verdant Charm",
    type:'Sorcery',
    cost:{G:1,C:2},
    art:'🌿',
    text:"Choose one — Target creature gets +3/+3 until end of turn; or put a +1/+1 counter on target creature you control; or search your library for a creature card.",
    effects: {
      modeNames: ['Wilds (+3/+3 EOT)', 'Bloom (+1/+1 counter)', 'Hunt (search creature)'],
      modes: [
        [{kind:'pump', target:'creature', power:3, toughness:3}],
        [{kind:'addCounter', target:'creature', power:1, toughness:1, filter:{controller:'self'}}],
        [{kind:'searchCreature'}],
      ],
    },
  },

  // ========================================================================
  // TRIGGERED ABILITIES SET (v0.40). One per color showcasing the new system.
  // ========================================================================
  benevolentAngel:{name:'Benevolent Angel', type:'Creature', sub:'Angel', cost:{W:2,C:3}, power:3, toughness:4, art:'👼',
                   text:'Flying. When this enters the battlefield, you gain 3 life.',
                   keywords:['flying'],
                   triggers:[{
                     event: 'cardEntersBattlefield',
                     condId: 'thisEnters',
                     text: 'When ~ enters, you gain 3 life.',
                     effects: [{kind:'gainLife', target:'self', amount:3}],
                   }]},
  visionarySage:{name:'Visionary Sage',   type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:2, toughness:2, art:'👴',
                  text:'When this enters the battlefield, draw a card.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},
  cultPriest:   {name:'Cult Priest',      type:'Creature', sub:'Human Cleric', cost:{B:1,C:1}, power:2, toughness:1, art:'⛧',
                  text:'When this dies, target opponent loses 2 life.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, target opponent loses 2 life.',
                    effects: [{kind:'damage', target:'player', amount:2}],
                  }]},
  flameSummoner:{name:'Flame Summoner',   type:'Creature', sub:'Human Shaman', cost:{R:1,C:2}, power:2, toughness:2, art:'🔥',
                  text:'When this enters the battlefield, deal 2 damage to any target.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, deal 2 damage to any target.',
                    effects: [{kind:'damage', target:'any', amount:2}],
                  }]},
  forestForager:{name:'Forest Forager',   type:'Creature', sub:'Elf Druid', cost:{G:1,C:2}, power:2, toughness:2, art:'🌲',
                  text:'When this enters the battlefield, search for a basic land and put it onto the battlefield tapped.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, search for a land.',
                    effects: [{kind:'searchLandTapped'}],
                  }]},

  // ========================================================================
  // TRIGGERED ABILITIES — EXPANDED SET (v0.44). ~10 per color. Designed to
  // exercise as much trigger surface area as possible: targeted ETBs, dies
  // triggers with targets, attack triggers, multi-effect triggers, etc.
  // ========================================================================

  // ─────────── WHITE triggered ───────────
  righteousJudge:{name:'Righteous Judge',  type:'Creature', sub:'Human Knight', cost:{W:2,C:3}, power:3, toughness:3, art:'⚖',
                  text:'When this enters, destroy target tapped creature.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, destroy target tapped creature.',
                    effects: [{kind:'removeCreature', severity:3, target:'creature', filter:{tapped:true}}],
                  }]},
  ancestralPriest:{name:'Ancestral Priest',type:'Creature', sub:'Human Cleric', cost:{W:1,C:1}, power:1, toughness:3, art:'🙏',
                  text:'When this enters, you gain 2 life.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, you gain 2 life.',
                    effects: [{kind:'gainLife', target:'self', amount:2}],
                  }]},
  cavalryCaptain:{name:'Cavalry Captain',  type:'Creature', sub:'Human Knight', cost:{W:1,C:2}, power:2, toughness:2, art:'🐎',
                  text:'First strike. When this attacks, it gets +2/+0 EOT.',
                  keywords:['firstStrike'],
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, it gets +2/+0 EOT.',
                    effects: [{kind:'pump', target:'self', power:2, toughness:0}],
                  }]},
  martyrSaint: {name:'Martyr-Saint',      type:'Creature', sub:'Human Cleric', cost:{W:1,C:1}, power:1, toughness:2, art:'🕯',
                  text:'When this dies, you gain 3 life.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, you gain 3 life.',
                    effects: [{kind:'gainLife', target:'self', amount:3}],
                  }]},
  bindingAngel:{name:'Binding Angel',     type:'Creature', sub:'Angel', cost:{W:2,C:4}, power:3, toughness:4, art:'🪽', keywords:['flying'],
                  text:'Flying. When this enters, tap target creature.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, tap target creature.',
                    effects: [{kind:'removeCreature', severity:1, target:'creature'}],
                  }]},
  inspiringHerald:{name:'Inspiring Herald',type:'Creature', sub:'Human Soldier', cost:{W:1,C:3}, power:2, toughness:3, art:'📯',
                  text:'When this enters, creatures you control get +1/+1 EOT.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, creatures you control get +1/+1 EOT.',
                    effects: [{kind:'pumpAllYours', power:1, toughness:1}],
                  }]},
  exorcist:    {name:'Exorcist',          type:'Creature', sub:'Human Cleric', cost:{W:2,C:2}, power:2, toughness:3, art:'✨',
                  text:'When this enters, exile target creature; its controller gains life equal to its power.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, exile target creature.',
                    effects: [{kind:'removeCreature', severity:4, target:'creature'}, {kind:'gainLife', target:'creature', who:{from:'targetController'}, amount:{from:'targetPower'}}],
                  }]},
  zealot:      {name:'Holy Zealot',       type:'Creature', sub:'Human Cleric', cost:{W:1}, power:1, toughness:1, art:'🔥',
                  text:'Haste. When this attacks, you gain 1 life.',
                  keywords:['haste'],
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, you gain 1 life.',
                    effects: [{kind:'gainLife', target:'self', amount:1}],
                  }]},
  vengefulSpirit:{name:'Vengeful Spirit', type:'Creature', sub:'Spirit', cost:{W:1,C:2}, power:2, toughness:2, art:'👻', keywords:['flying'],
                  text:'Flying. When this dies, destroy target creature.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, destroy target creature.',
                    effects: [{kind:'removeCreature', severity:3, target:'creature'}],
                  }]},
  scribeMonk:  {name:'Wall of Omens',     type:'Creature', sub:'Wall', cost:{W:1,C:1}, power:0, toughness:4, art:'📜', keywords:['defender'],
                  text:'Defender. When this enters, draw a card.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},

  // ─────────── BLUE triggered ───────────
  cloudCaller:{name:'Cloud Caller',       type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:1, toughness:3, art:'☁',
                  text:'When this enters, return target creature to its owner\'s hand.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, bounce target creature.',
                    effects: [{kind:'removeCreature', severity:2, target:'creature'}],
                  }]},
  frostBinder:{name:'Frost Binder',       type:'Creature', sub:'Human Wizard', cost:{U:1,C:1}, power:1, toughness:2, art:'❄',
                  text:'When this enters, tap target creature.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, tap target creature.',
                    effects: [{kind:'removeCreature', severity:1, target:'creature'}],
                  }]},
  martyredScholar:{name:'Martyred Scholar',type:'Creature', sub:'Human Wizard', cost:{U:1,C:1}, power:1, toughness:1, art:'🎓',
                  text:'When this dies, draw a card.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},
  duskRider:   {name:'Dusk Rider',        type:'Creature', sub:'Drake', cost:{U:1,C:2}, power:2, toughness:2, art:'🌒', keywords:['flying'],
                  text:'Flying. When this attacks, draw a card, then discard a card.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, loot 1.',
                    effects: [{kind:'draw', amount:1}, {kind:'discard', target:'self', amount:1}],
                  }]},
  bindspeaker:{name:'Bindspeaker',        type:'Creature', sub:'Human Wizard', cost:{U:2,C:1}, power:1, toughness:3, art:'🪢',
                  text:"When this enters, target creature gains defender until ~ dies.",
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: '~ enters — target creature gains defender.',
                    effects: [{kind:'grantKeyword', target:'creature', keyword:'defender'}],
                  }]},
  loreSeeker: {name:'Lore Seeker',        type:'Creature', sub:'Human Wizard', cost:{U:2,C:3}, power:1, toughness:4, art:'📖',
                  text:'When you cast a spell, draw a card.',
                  triggers:[{
                    event: 'spellCast',
                    // condition's 3rd arg is the source's controller. Trigger fires
                    // when the spell-caster matches.
                    condId: 'youCastSpell',
                    text: 'When you cast a spell, draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},
  mistRaider: {name:'Mist Raider',        type:'Creature', sub:'Human Pirate', cost:{U:1,C:3}, power:2, toughness:3, art:'⚓', keywords:['flying'],
                  text:'Flying. When this attacks, return target creature to its owner\'s hand.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, bounce target creature.',
                    effects: [{kind:'removeCreature', severity:2, target:'creature'}],
                  }]},
  archivist:   {name:'Archivist',         type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:1, toughness:2, art:'🗂',
                  text:'When this enters, draw 2 cards, then discard 1 card.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, draw 2, discard 1.',
                    effects: [{kind:'draw', amount:2}, {kind:'discard', target:'self', amount:1}],
                  }]},
  echoSpirit: {name:'Echo Spirit',        type:'Creature', sub:'Spirit', cost:{U:1,C:1}, power:1, toughness:2, art:'💨', keywords:['flying'],
                  text:'Flying. When this dies, return target creature to its owner\'s hand.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, bounce target creature.',
                    effects: [{kind:'removeCreature', severity:2, target:'creature'}],
                  }]},

  // ─────────── BLACK triggered ───────────
  bloodPriest: {name:'Blood Priest',      type:'Creature', sub:'Human Cleric', cost:{B:1,C:1}, power:1, toughness:2, art:'🩸',
                  text:'When this enters, target opponent loses 2 life.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, target opponent loses 2 life.',
                    effects: [{kind:'damage', target:'player', amount:2}],
                  }]},
  graveCurate:{name:'Grave Curate',       type:'Creature', sub:'Human Cleric', cost:{B:1,C:2}, power:2, toughness:2, art:'⚱',
                  text:'When this dies, target opponent discards a card.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, target opp discards.',
                    effects: [{kind:'discard', target:'player', amount:1}],
                  }]},
  reaperShade:{name:'Reaper Shade',       type:'Creature', sub:'Shade', cost:{B:1,C:3}, power:2, toughness:3, art:'🌑',
                  text:'When this enters, destroy target creature with toughness 2 or less.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, destroy weak creature.',
                    effects: [{kind:'removeCreature', severity:3, target:'creature', filter:{maxTough:2}}],
                  }]},
  spitefulImp:{name:'Spiteful Imp',       type:'Creature', sub:'Imp', cost:{B:1,C:1}, power:2, toughness:1, art:'😈', keywords:['flying'],
                  text:'Flying. When this dies, target opponent loses 1 life.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, opp loses 1 life.',
                    effects: [{kind:'damage', target:'player', amount:1}],
                  }]},
  blackKnight: {name:'Ravenous Chupacabra', type:'Creature', sub:'Beast', cost:{B:1,C:3}, power:2, toughness:2, art:'🐺',
                  text:'When this enters, destroy target creature.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, destroy target creature.',
                    effects: [{kind:'removeCreature', severity:3, target:'creature'}],
                  }]},
  fallenChampion:{name:'Fallen Champion', type:'Creature', sub:'Human Warrior', cost:{B:1,C:2}, power:3, toughness:2, art:'💀',
                  text:'When this dies, target opponent loses 2 life.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, opp loses 2 life.',
                    effects: [{kind:'damage', target:'player', amount:2}],
                  }]},
  bloodthirster:{name:'Bloodthirster',    type:'Creature', sub:'Vampire', cost:{B:1,C:2}, power:2, toughness:2, art:'🦇', keywords:['flying','lifelink'],
                  text:'Flying, Lifelink. When this attacks, deal 1 damage to any target.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, deal 1 to any target.',
                    effects: [{kind:'damage', target:'any', amount:1}],
                  }]},
  curseShade: {name:'Curse Shade',        type:'Creature', sub:'Shade', cost:{B:1,C:2}, power:2, toughness:2, art:'🌫',
                  text:'When this dies, exile target creature.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, exile target creature.',
                    effects: [{kind:'removeCreature', severity:4, target:'creature'}],
                  }]},

  // ─────────── RED triggered ───────────
  emberHerald:{name:'Ember Herald',       type:'Creature', sub:'Human Shaman', cost:{R:1,C:1}, power:1, toughness:2, art:'🔥',
                  text:'When this enters, deal 1 damage to any target.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, deal 1 to any target.',
                    effects: [{kind:'damage', target:'any', amount:1}],
                  }]},
  flameWisp:  {name:'Flame Wisp',         type:'Creature', sub:'Elemental', cost:{R:1,C:2}, power:2, toughness:2, art:'✨',
                  text:'When this enters, deal 2 damage to target creature.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, deal 2 to target creature.',
                    effects: [{kind:'damage', target:'creature', amount:2}],
                  }]},
  raidLeader: {name:'Goblin Slinger',     type:'Creature', sub:'Goblin Warrior', cost:{R:1,C:2}, power:2, toughness:2, art:'🪨',
                  text:'When this attacks, deal 1 damage to any target.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, deal 1 to any target.',
                    effects: [{kind:'damage', target:'any', amount:1}],
                  }]},
  burnoutShaman:{name:'Burnout Shaman',   type:'Creature', sub:'Goblin Shaman', cost:{R:1,C:1}, power:2, toughness:1, art:'🔥',
                  text:'When this dies, deal 2 damage to any target.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, deal 2 to any target.',
                    effects: [{kind:'damage', target:'any', amount:2}],
                  }]},
  warDancer: {name:'War Dancer',          type:'Creature', sub:'Human Warrior', cost:{R:1,C:1}, power:1, toughness:2, art:'💃', keywords:['haste'],
                  text:'Haste. When this enters, it gets +1/+0 EOT.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, it gets +1/+0 EOT.',
                    effects: [{kind:'pump', target:'self', power:1, toughness:0}],
                  }]},
  warchanter: {name:'Warchanter',         type:'Creature', sub:'Goblin Shaman', cost:{R:2,C:2}, power:2, toughness:3, art:'🥁',
                  text:'When this attacks, creatures you control get +1/+0 EOT.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, creatures you control get +1/+0 EOT.',
                    effects: [{kind:'pumpAllYours', power:1, toughness:0}],
                  }]},
  inferno_lord:{name:'Inferno Lord',      type:'Creature', sub:'Elemental', cost:{R:2,C:3}, power:3, toughness:3, art:'🌋',
                  text:'When this enters, deal 3 damage to any target.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, deal 3 to any target.',
                    effects: [{kind:'damage', target:'any', amount:3}],
                  }]},
  beastBaiter: {name:'Furnace Brute',     type:'Creature', sub:'Goblin Berserker', cost:{R:1,C:3}, power:3, toughness:3, art:'🔨',
                  text:'When this enters, deal 3 damage to target creature.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, deal 3 to target creature.',
                    effects: [{kind:'damage', target:'creature', amount:3}],
                  }]},
  goblinPiercer:{name:'Goblin Piercer',   type:'Creature', sub:'Goblin Warrior', cost:{R:1}, power:1, toughness:1, art:'🏹',
                  text:'When this attacks, deal 1 damage to target opponent.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, deal 1 to target opp.',
                    effects: [{kind:'damage', target:'player', amount:1}],
                  }]},

  // ─────────── GREEN triggered ───────────
  surgingBeast:{name:'Surging Beast',     type:'Creature', sub:'Beast', cost:{G:1,C:2}, power:3, toughness:2, art:'🐗', keywords:['haste'],
                  text:'Haste. When this enters, it gets +1/+1 EOT.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, it gets +1/+1 EOT.',
                    effects: [{kind:'pump', target:'self', power:1, toughness:1}],
                  }]},
  greatherder:{name:'Great Herder',       type:'Creature', sub:'Elf Druid', cost:{G:2,C:2}, power:3, toughness:3, art:'🌿',
                  text:'When this enters, search for a basic land and put it onto the battlefield tapped.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, fetch a land tapped.',
                    effects: [{kind:'searchLandTapped'}],
                  }]},
  hornedHerald:{name:'Horned Herald',     type:'Creature', sub:'Beast', cost:{G:1,C:3}, power:3, toughness:3, art:'🦬',
                  text:'When this enters, creatures you control get +1/+1 EOT.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, your creatures get +1/+1 EOT.',
                    effects: [{kind:'pumpAllYours', power:1, toughness:1}],
                  }]},
  apexHunter: {name:'Apex Hunter',        type:'Creature', sub:'Beast', cost:{G:2,C:2}, power:4, toughness:3, art:'🐯',
                  text:"When this enters, your strongest creature fights target opponent's creature.",
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, fight target creature.',
                    effects: [{kind:'fightTarget', target:'creature', filter:{controller:'opp'}}],
                  }]},
  feralStalker:{name:'Feral Stalker',     type:'Creature', sub:'Cat', cost:{G:1,C:2}, power:2, toughness:2, art:'🐅',
                  text:'When this attacks, it gets +2/+2 EOT.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, it gets +2/+2 EOT.',
                    effects: [{kind:'pump', target:'self', power:2, toughness:2}],
                  }]},
  lastDruid:  {name:'Last Druid',         type:'Creature', sub:'Elf Druid', cost:{G:1,C:2}, power:2, toughness:2, art:'🍃',
                  text:'When this dies, search your library for a creature card.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, tutor a creature.',
                    effects: [{kind:'searchCreature'}],
                  }]},
  awakener:    {name:'Awakener',          type:'Creature', sub:'Elf Druid', cost:{G:1,C:2}, power:2, toughness:3, art:'🌅',
                  text:'When this enters, put a +1/+1 counter on target creature you control.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, put a +1/+1 counter on target friendly creature.',
                    effects: [{kind:'addCounter', target:'creature', power:1, toughness:1, filter:{controller:'self'}}],
                  }]},
  oldGuardian:{name:'Old Guardian',       type:'Creature', sub:'Treefolk', cost:{G:1,C:3}, power:2, toughness:5, art:'🌳',
                  text:'When this dies, put two +1/+1 counters on target creature you control.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, put two +1/+1 counters on target friendly creature.',
                    effects: [{kind:'addCounter', target:'creature', power:2, toughness:2, filter:{controller:'self'}}],
                  }]},
  vinetwister:{name:'Vine Twister',       type:'Creature', sub:'Treefolk', cost:{G:2,C:1}, power:2, toughness:2, art:'🌿',
                  text:'When this enters, target creature you control gains trample as long as ~ stays in play.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, target creature gains trample.',
                    effects: [{kind:'grantKeyword', target:'creature', keyword:'trample', filter:{controller:'self'}}],
                  }]},
  natureCaller:{name:'Nature Caller',     type:'Creature', sub:'Elf Druid', cost:{G:2,C:1}, power:1, toughness:3, art:'🦌',
                  text:'When this enters, search your library for a creature card.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, tutor a creature.',
                    effects: [{kind:'searchCreature'}],
                  }]},

  // ========================================================================
  // KEYWORD-EXERCISING CARDS (v0.46). Cards using the new evergreens.
  // ========================================================================

  silverPaladin:{name:'Silver Paladin',   type:'Creature', sub:'Human Knight', cost:{W:1,C:2}, power:2, toughness:2, art:'⚔', text:'Lifelink', keywords:['lifelink']},
  angelOfDawn:  {name:'Dawn Angel',        type:'Creature', sub:'Angel', cost:{W:2,C:3}, power:3, toughness:4, art:'👼', text:'Flying, Lifelink', keywords:['flying','lifelink']},
  ironStatue:   {name:'Iron Statue',       type:'Creature', sub:'Construct Wall', cost:{W:1,C:2}, power:0, toughness:5, art:'🗿', text:'Defender, Indestructible', keywords:['defender','indestructible']},
  whiteFortress:{name:'Steadfast Wall',    type:'Creature', sub:'Wall', cost:{W:1,C:1}, power:0, toughness:5, art:'🧱', text:'Defender, Flying', keywords:['defender','flying']},
  pridemate:    {name:"Ajani's Pridemate",  type:'Creature', sub:'Cat Soldier', cost:{W:1,C:1}, power:2, toughness:2, art:'🦁',
                  text:'Whenever you gain life, put a +1/+1 counter on this.',
                  triggers:[{
                    event: 'lifeGained',
                    // Only fires when Pridemate's controller is the one
                    // gaining life. Self-trigger via lifelink: if Pridemate
                    // is granted lifelink and damages opp, that life-gain
                    // triggers itself — feature, not bug.
                    condId: 'youGainLife',
                    text: 'When you gain life, put a +1/+1 counter on ~.',
                    effects: [{kind:'addCounter', target:'self', power:1, toughness:1}],
                  }]},

  veilSerpent:  {name:'Veiled Serpent',   type:'Creature', sub:'Serpent', cost:{U:1,C:2}, power:2, toughness:3, art:'🐍', text:'Hexproof', keywords:['hexproof']},
  flashMage:    {name:'Quickdraw Mage',    type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:2, toughness:2, art:'⚡', text:'Flash', keywords:['flash']},
  ambushDjinn:  {name:'Ambush Djinn',      type:'Creature', sub:'Djinn', cost:{U:2,C:3}, power:4, toughness:4, art:'🌪', text:'Flash, Flying', keywords:['flash','flying']},

  venomViper:   {name:'Venom Viper',       type:'Creature', sub:'Snake', cost:{B:1,C:1}, power:1, toughness:2, art:'🐍', text:'Deathtouch', keywords:['deathtouch']},
  shadowAssassin:{name:'Shadow Assassin', type:'Creature', sub:'Human Assassin', cost:{B:1,C:2}, power:2, toughness:2, art:'🗡', text:'Deathtouch, Menace', keywords:['deathtouch','menace']},
  pitFiend:     {name:'Pit Fiend',         type:'Creature', sub:'Demon', cost:{B:2,C:3}, power:5, toughness:4, art:'😈', text:'Menace, Flying', keywords:['menace','flying']},

  duelist:      {name:'Goblin Duelist',    type:'Creature', sub:'Goblin Warrior', cost:{R:1,C:1}, power:2, toughness:1, art:'🤺', text:'First strike', keywords:['firstStrike']},
  warriorChamp: {name:'Warrior Champion',  type:'Creature', sub:'Human Warrior', cost:{R:1,C:2}, power:3, toughness:2, art:'⚔', text:'First strike, Haste', keywords:['firstStrike','haste']},
  bloodKnight:  {name:'Blood Knight',      type:'Creature', sub:'Human Knight', cost:{R:1,C:3}, power:4, toughness:3, art:'🩸', text:'First strike, Trample', keywords:['firstStrike','trample']},

  forestGuard:  {name:'Forest Guardian',   type:'Creature', sub:'Treefolk', cost:{G:1,C:3}, power:3, toughness:5, art:'🌳', text:'Reach, Vigilance', keywords:['reach','vigilance']},
  oxenHerd:     {name:'Oxen Herd',         type:'Creature', sub:'Beast', cost:{G:2,C:2}, power:4, toughness:4, art:'🐂', text:'Trample, Lifelink', keywords:['trample','lifelink']},

  // ========================================================================
  // BUILD-AROUND SET (v0.99.39). Cards designed around recurring triggers,
  // tribal payoffs, spell-cast synergy, and keyword grants — the kind of
  // cards a deck builds around rather than just plays. Brings each color
  // to ~40. Uses only existing effect kinds; no engine changes.
  // ========================================================================

  // ─────────── WHITE build-arounds (5) ───────────
  steelInitiate:{name:'Steel Initiate',   type:'Creature', sub:'Human Soldier', cost:{W:1}, power:2, toughness:2, art:'⚔',
                  text:'When this attacks, you gain 1 life.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, you gain 1 life.',
                    effects: [{kind:'gainLife', target:'self', amount:1}],
                  }]},
  skyChampion:  {name:'Sky Champion',     type:'Creature', sub:'Spirit', cost:{W:1,C:2}, power:2, toughness:2, art:'🪽', keywords:['flying'],
                  text:'Flying. When this enters, target creature you control gains flying as long as ~ stays in play.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, target friendly creature gains flying.',
                    effects: [{kind:'grantKeyword', target:'creature', keyword:'flying', filter:{controller:'self'}}],
                  }]},
  soulbladeCaptain:{name:'Soulblade Captain', type:'Creature', sub:'Human Knight', cost:{W:1,C:2}, power:2, toughness:2, art:'🏇',
                  text:'Whenever you cast a spell, creatures you control get +1/+0 EOT.',
                  triggers:[{
                    event: 'spellCast',
                    condId: 'youCastSpell',
                    text: 'Spell cast — your creatures get +1/+0 EOT.',
                    effects: [{kind:'pumpAllYours', power:1, toughness:0}],
                  }]},
  patientSaint: {name:'Patient Saint',    type:'Creature', sub:'Human Cleric Wall', cost:{W:1,C:1}, power:0, toughness:4, art:'🕯', keywords:['defender'],
                  text:'Defender. T: You gain 1 life.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'gainLife', target:'self', amount:1}]}]},
  crusaderCaptain:{name:'Crusader Captain', type:'Creature', sub:'Human Knight', cost:{W:2,C:2}, power:3, toughness:3, art:'🛡',
                  text:'When this attacks, target creature you control gets +1/+1 EOT.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, target friendly creature gets +1/+1 EOT.',
                    effects: [{kind:'pump', target:'creature', power:1, toughness:1, filter:{controller:'self'}}],
                  }]},

  // ─────────── BLUE build-arounds (8) ───────────
  wizardAdept:  {name:'Wizard Adept',     type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:1, toughness:3, art:'🧠',
                  text:'Whenever you cast a spell, draw a card, then discard a card.',
                  triggers:[{
                    event: 'spellCast',
                    condId: 'youCastSpell',
                    text: 'Spell cast — loot 1.',
                    effects: [{kind:'draw', amount:1}, {kind:'discard', target:'self', amount:1}],
                  }]},
  frostbiteMage:{name:'Frostbite Mage',   type:'Creature', sub:'Human Wizard', cost:{U:1,C:1}, power:1, toughness:2, art:'❄',
                  text:'When this enters, target creature gets -2/-0 EOT.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, target creature gets -2/-0 EOT.',
                    effects: [{kind:'weaken', target:'creature', power:2, toughness:0}],
                  }]},
  stormSage:    {name:'Storm Sage',       type:'Creature', sub:'Human Wizard', cost:{U:2,C:2}, power:2, toughness:3, art:'⛈',
                  text:'Whenever another creature enters under your control, draw a card.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'anotherCreatureYouEntersStrict',
                    text: 'Another creature entered — draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},
  quickling:    {name:'Quickling',        type:'Creature', sub:'Faerie', cost:{U:2}, power:2, toughness:1, art:'🧚‍♂', keywords:['flash','flying'],
                  text:"Flash, Flying. When this enters, return target creature to its owner's hand.",
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, bounce target creature.',
                    effects: [{kind:'removeCreature', severity:2, target:'creature'}],
                  }]},
  aetherVoyager:{name:'Aether Voyager',   type:'Creature', sub:'Spirit', cost:{U:1,C:3}, power:2, toughness:3, art:'🌬', keywords:['flying'],
                  text:'Flying. When this attacks, draw a card.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},
  counterSpecialist:{name:'Counter Specialist', type:'Creature', sub:'Human Wizard', cost:{U:1,C:2}, power:1, toughness:4, art:'🚫',
                  text:'Whenever you cast a counterspell, put a +1/+1 counter on this.',
                  triggers:[{
                    event: 'spellCast',
                    // Conservative for modal cards: trigger if ANY mode contains
                    // a counter effect, since the spellCast event doesn't carry
                    // the chosen mode index. Friendlier interpretation for the
                    // owner; over-triggering is preferred to under-triggering
                    // here (the cost is "+1/+1 counter when you didn't really
                    // counter anything"), and the current cast log makes it
                    // easy to see what happened.
                    condId: 'youCastCounterspell',
                    text: 'Counter cast — put a +1/+1 counter on ~.',
                    effects: [{kind:'addCounter', target:'self', power:1, toughness:1}],
                  }]},
  mirrorSage:   {name:'Mirror Sage',      type:'Creature', sub:'Human Wizard', cost:{U:1,C:1}, power:1, toughness:2, art:'🪞',
                  text:'T: Tap target creature.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'removeCreature', severity:1, target:'creature'}]}]},
  aetherDrake:  {name:'Aether Drake',     type:'Creature', sub:'Drake', cost:{U:1,C:3}, power:2, toughness:3, art:'🐲', keywords:['flying'],
                  text:'Flying. When this enters, target creature you control gains hexproof as long as ~ stays in play.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, target friendly creature gains hexproof.',
                    effects: [{kind:'grantKeyword', target:'creature', keyword:'hexproof', filter:{controller:'self'}}],
                  }]},

  // ─────────── BLACK build-arounds (8) ───────────
  soulReaper:   {name:'Soul Reaper',      type:'Creature', sub:'Demon', cost:{B:1,C:3}, power:3, toughness:3, art:'🌑', keywords:['flying'],
                  text:'Flying. Whenever another creature dies, you gain 1 life.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'anotherCreatureDies',
                    text: 'Another creature died — you gain 1 life.',
                    effects: [{kind:'gainLife', target:'self', amount:1}],
                  }]},
  morticianAssistant:{name:"Mortician's Assistant", type:'Creature', sub:'Zombie', cost:{B:1,C:1}, power:1, toughness:3, art:'⚰',
                  text:'When this dies, return target creature card from your graveyard to your hand.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, return a creature from your graveyard.',
                    effects: [{kind:'returnFromGraveyard', target:'graveyardCreature'}],
                  }]},
  dreadWraith:  {name:'Dread Wraith',     type:'Creature', sub:'Spirit', cost:{B:1,C:2}, power:3, toughness:2, art:'👻', keywords:['flying'],
                  text:'Flying. When this enters, target opponent loses 2 life.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, opp loses 2 life.',
                    effects: [{kind:'damage', target:'player', amount:2}],
                  }]},
  boneCollector:{name:'Bone Collector',   type:'Creature', sub:'Zombie', cost:{B:2,C:2}, power:2, toughness:3, art:'💀',
                  text:'Whenever another creature dies, put a +1/+1 counter on this.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'anotherCreatureDies',
                    text: 'Another creature died — put a +1/+1 counter on ~.',
                    effects: [{kind:'addCounter', target:'self', power:1, toughness:1}],
                  }]},
  bloodthirstyStalker:{name:'Bloodthirsty Stalker', type:'Creature', sub:'Vampire', cost:{B:1,C:2}, power:2, toughness:2, art:'🧛', keywords:['menace'],
                  text:'Menace. When this attacks, target opponent loses 1 life.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, opp loses 1 life.',
                    effects: [{kind:'damage', target:'player', amount:1}],
                  }]},
  dreadKnightV2:{name:'Dread Knight',     type:'Creature', sub:'Human Knight', cost:{B:2,C:2}, power:4, toughness:3, art:'🏴', keywords:['menace'],
                  text:'Menace. When this enters, you lose 2 life.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, you lose 2 life.',
                    effects: [{kind:'damage', target:'self', amount:2}],
                  }]},
  plagueSower:  {name:'Plague Sower',     type:'Creature', sub:'Human Cleric', cost:{B:1,C:2}, power:2, toughness:2, art:'☠',
                  text:'When this enters, target creature gets -2/-2 EOT.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, target creature gets -2/-2 EOT.',
                    effects: [{kind:'weaken', target:'creature', power:2, toughness:2}],
                  }]},
  demonicTutor: {name:'Demonic Tutor',    type:'Sorcery',  cost:{B:1,C:1}, art:'🩸',
                  text:'Search your library for a creature card. You lose 2 life.',
                  effects:[{kind:'searchCreature'}, {kind:'damage', target:'self', amount:2}]},

  // ─────────── RED build-arounds (8) ───────────
  stormCaller:  {name:'Storm Caller',     type:'Creature', sub:'Human Shaman', cost:{R:1,C:2}, power:2, toughness:2, art:'⚡',
                  text:'Whenever you cast a spell, deal 1 damage to any target.',
                  triggers:[{
                    event: 'spellCast',
                    condId: 'youCastSpell',
                    text: 'Spell cast — deal 1 to any target.',
                    effects: [{kind:'damage', target:'any', amount:1}],
                  }]},
  vexingOgre:   {name:'Vexing Ogre',      type:'Creature', sub:'Ogre', cost:{R:1,C:2}, power:4, toughness:2, art:'👹',
                  text:'When this enters, you lose 1 life.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, you lose 1 life.',
                    effects: [{kind:'damage', target:'self', amount:1}],
                  }]},
  infernoCaller:{name:'Inferno Caller',   type:'Creature', sub:'Human Shaman', cost:{R:1,C:3}, power:2, toughness:3, art:'🔥',
                  text:'When this attacks, deal 2 damage to any target.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, deal 2 to any target.',
                    effects: [{kind:'damage', target:'any', amount:2}],
                  }]},
  angerHound:   {name:'Anger Hound',      type:'Creature', sub:'Hound', cost:{R:1,C:1}, power:2, toughness:1, art:'🐕',
                  text:'Whenever you cast a spell, this gets +1/+0 EOT.',
                  triggers:[{
                    event: 'spellCast',
                    condId: 'youCastSpell',
                    text: 'Spell cast — ~ gets +1/+0 EOT.',
                    effects: [{kind:'pump', target:'self', power:1, toughness:0}],
                  }]},
  wildfireDevil:{name:'Wildfire Devil',   type:'Creature', sub:'Devil', cost:{R:2,C:3}, power:3, toughness:3, art:'😈',
                  text:'When this dies, deal 3 damage to any target.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, deal 3 to any target.',
                    effects: [{kind:'damage', target:'any', amount:3}],
                  }]},
  furnaceWhelp: {name:'Furnace Whelp',    type:'Creature', sub:'Dragon', cost:{R:1,C:2}, power:2, toughness:2, art:'🐉', keywords:['flying'],
                  text:'Flying. {R}: this gets +1/+0 EOT.',
                  abilities:[{cost:{mana:{R:1}}, effects:[{kind:'pump', target:'self', power:1, toughness:0}]}]},
  spitfireBastion:{name:'Spitfire Bastion', type:'Creature', sub:'Wall', cost:{R:1,C:1}, power:1, toughness:3, art:'🏰', keywords:['defender'],
                  text:'Defender. T: Deal 1 damage to any target.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'damage', target:'any', amount:1}]}]},
  goblinWarDrummer:{name:'Goblin War Drummer', type:'Creature', sub:'Goblin Shaman', cost:{R:1,C:1}, power:2, toughness:1, art:'🥁',
                  text:'Whenever another Goblin enters under your control, deal 1 damage to any target.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'anotherCreatureYouEntersOfSubtype', params: {sub: 'Goblin'},
                    text: 'Another Goblin entered — deal 1 to any target.',
                    effects: [{kind:'damage', target:'any', amount:1}],
                  }]},

  // ─────────── GREEN build-arounds (8) ───────────
  treetopSentry:{name:'Treetop Sentry',   type:'Creature', sub:'Treefolk', cost:{G:1,C:1}, power:2, toughness:3, art:'🌳', keywords:['reach'],
                  text:'Reach. When this dies, you gain 2 life.',
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, you gain 2 life.',
                    effects: [{kind:'gainLife', target:'self', amount:2}],
                  }]},
  vigorousDruid:{name:'Vigorous Druid',   type:'Creature', sub:'Elf Druid', cost:{G:1,C:2}, power:2, toughness:3, art:'🌱',
                  text:'T: Add {G}{G}.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'addMana', amounts:{G:2}}]}]},
  sageOfTheWilds:{name:'Sage of the Wilds', type:'Creature', sub:'Elf Druid', cost:{G:1,C:2}, power:2, toughness:3, art:'🦌',
                  text:'T: Untap target creature you control.',
                  abilities:[{cost:{tap:true}, effects:[{kind:'untap', target:'creature', filter:{controller:'self', tapped:true}}]}]},
  beastWhisperer:{name:'Beast Whisperer', type:'Creature', sub:'Elf Druid', cost:{G:1,C:3}, power:2, toughness:4, art:'🦉',
                  text:'Whenever another creature enters under your control, draw a card.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'anotherCreatureYouEntersStrict',
                    text: 'Another creature entered — draw a card.',
                    effects: [{kind:'draw', amount:1}],
                  }]},
  garruksCompanion:{name:"Garruk's Companion", type:'Creature', sub:'Beast', cost:{G:1,C:1}, power:3, toughness:2, art:'🐺', keywords:['trample'],
                  text:'Trample.'},
  verdantOutrider:{name:'Verdant Outrider', type:'Creature', sub:'Beast', cost:{G:1,C:2}, power:3, toughness:2, art:'🏇',
                  text:'When this attacks, search your library for a basic land card and put it onto the battlefield tapped.',
                  triggers:[{
                    event: 'attacks',
                    condId: 'thisAttacks',
                    text: 'When ~ attacks, fetch a land tapped.',
                    effects: [{kind:'searchLandTapped'}],
                  }]},
  symbioteTree: {name:'Symbiote Tree',    type:'Creature', sub:'Treefolk', cost:{G:1,C:3}, power:2, toughness:4, art:'🌲', keywords:['reach'],
                  text:'Reach. When this enters, put a +1/+1 counter on target creature you control and it gains reach as long as ~ stays in play.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, put a +1/+1 counter on target friendly creature and it gains reach.',
                    effects: [
                      {kind:'addCounter', target:'creature', power:1, toughness:1, filter:{controller:'self'}},
                      {kind:'grantKeyword', target:'creature', keyword:'reach', filter:{controller:'self'}},
                    ],
                  }]},
  wolfbriarElemental:{name:'Wolfbriar Elemental', type:'Creature', sub:'Elemental', cost:{G:1,C:3}, power:4, toughness:4, art:'🌿', keywords:['trample'],
                  text:'Trample. When this enters, untap target creature you control.',
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, untap target friendly creature.',
                    effects: [{kind:'untap', target:'creature', filter:{controller:'self'}}],
                  }]},

  // ========================================================================
  // TRIBAL LORDS — each grants +1/+1 (and sometimes keywords) to other tribe
  // members via staticBuffs. Read by getStats() at the continuous-effect
  // layer; keyword grants flow through grantedBy via applyStaticKeywordGrants.
  // When a lord dies, dependent creatures may drop to 0 toughness and die.
  // ========================================================================

  archmagePatriarch:{name:'Archmage Patriarch', type:'Creature', sub:'Human Wizard', cost:{U:1,C:3}, power:2, toughness:3, art:'🧙',
                  text:'Other Wizards you control get +1/+1. Whenever you cast a spell, draw a card, then discard a card.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Wizard', power:1, toughness:1}],
                  triggers:[{
                    event: 'spellCast',
                    condId: 'youCastSpell',
                    text: 'Spell cast — loot 1 (draw, then discard).',
                    effects: [{kind:'draw', amount:1}, {kind:'discard', target:'self', amount:1}],
                  }]},

  goblinChieftain:{name:'Goblin Chieftain',  type:'Creature', sub:'Goblin', cost:{R:1,C:1}, power:2, toughness:2, art:'👑', keywords:['haste'],
                  text:'Haste. Other Goblins you control get +1/+1 and have haste. Whenever a Goblin you control attacks, target opponent loses 1 life.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Goblin', power:1, toughness:1, keywords:['haste']}],
                  triggers:[{
                    event: 'attacks',
                    condId: 'creatureYouAttacksOfSubtype', params: {sub: 'Goblin'},
                    text: 'A Goblin attacked — opp loses 1 life.',
                    effects: [{kind:'damage', target:'player', amount:1}],
                  }]},

  druidElder:    {name:'Elder of the Grove', type:'Creature', sub:'Elf Druid', cost:{G:1,C:2}, power:1, toughness:3, art:'🌿',
                  text:'Other Druids you control get +1/+1. T: Add {G}{G}.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Druid', power:1, toughness:1}],
                  abilities:[{cost:{tap:true}, effects:[{kind:'addMana', amounts:{G:2}}]}]},

  knightCommander:{name:'Knight Commander',  type:'Creature', sub:'Human Knight', cost:{W:1,C:3}, power:3, toughness:3, art:'🏰', keywords:['vigilance'],
                  text:'Vigilance. Other Knights you control get +1/+1 and have vigilance.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Knight', power:1, toughness:1, keywords:['vigilance']}]},

  highPriestess:{name:'High Priestess',     type:'Creature', sub:'Human Cleric', cost:{W:1,C:2}, power:2, toughness:3, art:'⛪',
                  text:'Other Clerics you control get +1/+1. Whenever another Cleric enters under your control, you gain 2 life.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Cleric', power:1, toughness:1}],
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'anotherCreatureYouEntersOfSubtype', params: {sub: 'Cleric'},
                    text: 'Another Cleric entered — gain 2 life.',
                    effects: [{kind:'gainLife', target:'self', amount:2}],
                  }]},

  ancientTreant: {name:'Ancient Treant',     type:'Creature', sub:'Treefolk', cost:{G:2,C:3}, power:4, toughness:5, art:'🌲', keywords:['reach'],
                  text:'Reach. Other Treefolk you control get +1/+1. When this enters, search your library for a Forest and put it onto the battlefield tapped.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Treefolk', power:1, toughness:1}],
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'thisEnters',
                    text: 'When ~ enters, fetch a Forest tapped.',
                    effects: [{kind:'searchLandTapped'}],
                  }]},

  fieldMarshal:  {name:'Field Marshal',      type:'Creature', sub:'Human Soldier', cost:{W:2,C:1}, power:2, toughness:2, art:'🎖', keywords:['vigilance'],
                  text:'Vigilance. Other Soldiers you control get +1/+1 and have vigilance. Whenever a Soldier you control attacks, you gain 1 life.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Soldier', power:1, toughness:1, keywords:['vigilance']}],
                  triggers:[{
                    event: 'attacks',
                    condId: 'creatureYouAttacksOfSubtype', params: {sub: 'Soldier'},
                    text: 'A Soldier attacked — you gain 1 life.',
                    effects: [{kind:'gainLife', target:'self', amount:1}],
                  }]},

  spiritShepherd:{name:'Spirit Shepherd',    type:'Creature', sub:'Spirit', cost:{W:1,C:3}, power:2, toughness:3, art:'👻', keywords:['flying','hexproof'],
                  text:'Flying, Hexproof. Other Spirits you control get +1/+1 and have hexproof. When this dies, return a Spirit creature card from your graveyard to your hand.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Spirit', power:1, toughness:1, keywords:['hexproof']}],
                  triggers:[{
                    event: 'cardDies',
                    condId: 'thisDies',
                    text: 'When ~ dies, return a Spirit creature from your graveyard to your hand.',
                    effects: [{kind:'returnFromGraveyard', target:'graveyardCreature', filter:{subtype:'Spirit'}}],
                  }]},

  apexElder:     {name:'Apex Elder',         type:'Creature', sub:'Beast', cost:{G:2,C:3}, power:4, toughness:4, art:'🦬', keywords:['trample'],
                  text:'Trample. Other Beasts you control get +1/+1 and have trample. Whenever a Beast you control attacks, draw a card. Then discard a card.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Beast', power:1, toughness:1, keywords:['trample']}],
                  triggers:[{
                    event: 'attacks',
                    condId: 'creatureYouAttacksOfSubtype', params: {sub: 'Beast'},
                    text: 'A Beast attacked — loot 1.',
                    effects: [{kind:'draw', amount:1}, {kind:'discard', target:'self', amount:1}],
                  }]},

  drakelord:     {name:'Skyfire Drakelord',  type:'Creature', sub:'Drake', cost:{U:1,C:4}, power:3, toughness:4, art:'🐲', keywords:['flying','firstStrike'],
                  text:'Flying, First Strike. Other Drakes you control get +1/+1 and have first strike. Whenever another Drake enters under your control, deal 1 damage to any target.',
                  staticBuffs:[{filter:{controller:'self'}, subtype:'Drake', power:1, toughness:1, keywords:['firstStrike']}],
                  triggers:[{
                    event: 'cardEntersBattlefield',
                    condId: 'anotherCreatureYouEntersOfSubtype', params: {sub: 'Drake'},
                    text: 'Another Drake entered — deal 1 to any target.',
                    effects: [{kind:'damage', target:'any', amount:1}],
                  }]},

  // ─────────── SPECIAL (Neow-only) ───────────
  endomorph:    {name:'Endomorph', type:'Creature', sub:'Shapeshifter', cost:{C:2}, power:2, toughness:2, art:'🧬',
                 special: true,
                 text:"When this kills a creature, it permanently gains one of that creature's keywords. If it gained no keyword, it gains +1/+1 permanently instead.",
                 triggers:[{
                   event: 'cardDies',
                   condId: 'thisKillsCreature',
                   text: '~ kills ' + '{victim} — absorbs a keyword (or +1/+1).',
                   effects: [{kind:'endomorphAbsorb', target:'self'}],
                 }]},

  steal:        {name:'Steal', type:'Instant', cost:{C:5}, art:'🪄',
                 special: true,
                 text:"Counter target non-token spell or take target non-token permanent. The card becomes yours forever — shuffle it into your library.",
                 effects:[{kind:'steal', target:'permanentOrSpell', filter:{notToken:true}}]},

  phylactery:   {name:'Phylactery', type:'Land', sub:'Swamp', art:'💀', mana:'B',
                 special: true,
                 text:"Your life can't go below 0 and you can't lose to an empty library. Damage past 0 — and each would-be overdraw — rips that many slots from your deck instead. (This card is always ripped last.)"},

  // Elystra the Immortal — Neow boon. 1/1 for {3} that grows by absorbing
  // EOT-effect spells permanently. Two flag-driven mechanics:
  //   permanentEot: true — at end-of-turn cleanup, instead of clearing
  //     tempPower/tempTou and eotGrants, those values are converted into
  //     slot.permaBuffs (run-persistent) and survive deaths/games. So a
  //     Giant Growth on Elystra becomes a permanent +3/+3.
  //   ripOnTarget: true — when a non-creature spell resolves with Elystra
  //     in its target list, the spell's slot is ripped. For player-
  //     controlled spells, this is durable (gone from runState forever —
  //     the cost paid for permanent buffs). For opp-controlled spells,
  //     it's per-fight (gone from their library/hand/graveyard for the
  //     rest of this fight — defends against any future recursion effect
  //     that might let them cast removal twice). Elystra's permaBuffs
  //     survive her death so even if opp kills her, next game she comes
  //     back with all her accumulated growth.
  // The combination creates a "build-around" archetype: feed your support
  // cards to Elystra to grow her over the run, paying with deck thinning.
  // Removal targeted at her bites the caster — they pay full mana, the
  // spell still works, but they lose the spell from their fight options.
  elystra:      {name:'Elystra the Immortal', type:'Creature', sub:'Spirit', cost:{C:3}, power:1, toughness:1, art:'👻',
                 special: true,
                 permanentEot: true,
                 ripOnTarget: true,
                 text:"End-of-turn effects on Elystra last forever (buffs, granted keywords). Whenever a non-creature spell targets Elystra, rip it from its caster's deck after it resolves."},

  // The Mercurial Adept — Neow boon. Showcases the modular trigger system:
  // each game, this creature rolls one ability from a curated pool of six
  // and gains it for the game. The pool is fixed, the roll is fresh per
  // game, so the player has the same creature with a different personality
  // every fight. Implemented via:
  //   - mercurialPool field on the template: array of trigger objects.
  //   - At run-start, slot.triggerPool gets a copy of the template's pool.
  //   - At each game-start, makeCard reads slot.triggerPool, rolls one,
  //     and applies it as a bonusTrigger on the fresh card.
  //
  // The pool entries each carry a `label` for UI display (the player can
  // see ALL possible abilities on the card popup, with the active one
  // highlighted). Triggers reference existing condIds — no new vocabulary
  // required. Demonstrates that the trigger system is genuinely modular:
  // the same data slot can hold different behaviors over time.
  //
  // Power calibration: 3-mana 2/2 vanilla baseline (just slightly under
  // Rhox's 4-mana 4/4 rate). Trigger rolls are roughly equivalent in
  // strength — none alone makes the card dominant, but each gives it a
  // different deck-building synergy. Variance is intentional: the boon
  // sells the experience of "different ability every game" more than
  // raw power.
  // The Mercurial Adept — a 3-mana 2/2 Wizard whose ability rerolls each
  // game from a curated pool of six. Originally a Neow boon (showcasing
  // the modular trigger system at the run level), promoted to the regular
  // draft pool because the variance feels more like a fun card than a
  // run-defining moment. Colorless cost makes her splashable into any
  // archetype; the random-ability mechanic compensates for the splash by
  // making her contribution unpredictable. The triggerPool is seeded by
  // makePlayer's slot-construction path — see makePlayer for how triggers
  // get rolled per-game from a pool stored on the slot.
  mercurialAdept: {name:'The Mercurial Adept', type:'Creature', sub:'Human Wizard', cost:{C:3}, power:2, toughness:2, art:'🎭',
                   triggerPoolSeed: 'mercurial',  // see MERCURIAL_TRIGGER_POOL in module scope
                   text:"At the start of each game, ~ gains one of these abilities: deal 1 to opp on attack; +1/+0 EOT on spell cast; +1/+1 counter when an ally enters; draw on lifegain; return to hand on death; gain 1 life when an enemy creature dies."},

  // The Architect's Codex — Neow boon. The procedural-trigger showcase.
  // When drawn into hand (once per game), opens a modal offering 3 randomly-
  // generated triggers from the (condition × effect) space. The player picks
  // one (or keeps the existing if any) and that ability persists on the slot
  // for the rest of the run — until the next time the Codex is drawn, when
  // it offers another build moment with 3 fresh rolls. Across a 5-game run,
  // the Codex evolves through 5 build moments — a player-driven procedural
  // ability over time.
  //
  // The buildOnDraw flag triggers the modal flow in drawCard. The build
  // happens once per game per copy (tracked via card._builtThisGame, which
  // resets on each new game because cards are freshly built by makeCard).
  // The chosen trigger is written to slot.bonusTrigger, which survives
  // save/load and is materialized as card.triggers next game by makeCard.
  architectsCodex: {name:"The Architect's Codex", type:'Creature', sub:'Wizard Artificer', cost:{C:4}, power:2, toughness:3, art:'📜',
                    special: true,
                    buildOnDraw: true,
                    text:"When you draw ~, build an ability: pick one of three randomly-generated triggers (or keep the current one). The chosen ability persists for the rest of the run. Built abilities don't trigger from ~'s own effects."},

  // Stapler — Neow boon (v1.0.51). An Artifact (first of its type in the
  // engine) with three per-RUN charges. Each activation merges two
  // permanents via the same splice infrastructure used at reward-time.
  // The merged result lives on the caster's battlefield, slot in their
  // runState — functions as removal/steal when the inputs aren't theirs.
  //
  // Charges live on the slot (slot.charges, defaulting to 3). They
  // persist across games: kill Stapler turn 4, recast it next game,
  // it comes back with the remaining charges. When charges hits 0,
  // Stapler rip-ups its own slot (removed from the run permanently)
  // and any in-zone instances of Stapler are cleaned up.
  //
  // Cost shape: 3 to cast (a permanent on the battlefield), 3 to
  // activate per use, plus tap. Instant-speed because activated
  // abilities are instant-speed by default in this engine.
  //
  // v1.0.51 scope: permanent + permanent only. Spell-on-stack as
  // either input is deferred to v1.0.52+ — needs stack-merging
  // infrastructure that doesn't exist yet.
  stapler:        {name:'Stapler', type:'Artifact', cost:{C:3}, art:'📎',
                   special: true,
                   chargesAtRunStart: 3,
                   text:"3 charges (persist across runs). {3}, T: Choose two target permanents. Staple the second onto the first. When this is out of charges, rip it up.",
                   abilities:[{
                     cost:{tap:true, mana:{C:3}},
                     // Two effects so the targeting UI prompts for both targets.
                     // Effect 0 is the real one (does the merge using both
                     // targets via ctx.allTargets). Effect 1 is a pure marker
                     // (effect kind: 'noop') whose only purpose is forcing
                     // the validation harness to require a target at slot 1.
                     // v1.0.53: targets are 'permanentOrSpell' so either
                     // slot can be a permanent on the battlefield OR a
                     // spell on the stack. The handler auto-determines
                     // which is the base (permanent wins if mixed).
                     // Eligibility filter on each: 0 must be a spliceable
                     // base (or a spliceable spell for the S+S case), 1
                     // must be a spliceable staple (similar).
                     effects:[{kind:'applyInGameSplice', target:'permanentOrSpell', targetSlot:0, filter:{spliceableBase:true}},
                              {kind:'noop', target:'permanentOrSpell', targetSlot:1, filter:{spliceableStaple:true}}],
                   }]},
};

(function annotateColors() {
  for (const c of Object.values(CARDS)) {
    if (c.type === 'Land' || !c.cost) {
      c.color = null;
      c.colors = [];
      continue;
    }
    // Primary: first color in WUBRG order (legacy callers reading c.color).
    // Full set: all colors present in cost (for multi-color UI like
    // applyTileColor's gradient renderer). Sword and Sorcery has cost
    // {W:1,U:1,C:1} → c.color = 'W', c.colors = ['W','U']. Single-color
    // cards get c.colors = [c.color].
    const present = ['W','U','B','R','G'].filter(k => c.cost[k] > 0);
    c.color = present[0] || null;
    c.colors = present;
  }
})();

// TOKENS — minted by effects, not drafted. No slotIdx, vanish on leave-play
// (no graveyard residence). Dies-triggers DO fire on token death.
const TOKENS = {
  spirit_w_1_1:  {name:'Spirit',  type:'Creature', sub:'Spirit',  power:1, toughness:1, art:'👻', color:'W', text:'Flying', keywords:['flying']},
  soldier_w_1_1: {name:'Soldier', type:'Creature', sub:'Human Soldier', power:1, toughness:1, art:'⚔', color:'W'},
  goblin_r_1_1:  {name:'Goblin',  type:'Creature', sub:'Goblin',  power:1, toughness:1, art:'👺', color:'R', text:'Haste', keywords:['haste']},
  saproling_g_1_1: {name:'Saproling', type:'Creature', sub:'Saproling', power:1, toughness:1, art:'🌱', color:'G'},
  bear_g_2_2:    {name:'Bear',    type:'Creature', sub:'Bear',    power:2, toughness:2, art:'🐻', color:'G'},
};

// SHARED CONSTANTS

// Single source of truth — new keywords here auto-become available stickers.
const KEYWORDS = [
  'flying', 'vigilance', 'trample', 'haste',
  'firstStrike', 'reach', 'defender', 'indestructible',
  'lifelink', 'deathtouch', 'menace', 'hexproof', 'flash',
  'unblockable',
];

// STICKERS — run-long card modifications. Auto-generated from KEYWORDS plus
// hand-defined entries. Shape: {id, name, text, appliesTo, stackable, kind,
// weight, ...kind-payload}.
const STICKERS = {};
STICKERS['plus1plus1'] = {
  id: 'plus1plus1', name: '+1/+1',
  text: '+1 power and +1 toughness.',
  appliesTo: (c) => c.type === 'Creature',
  stackable: true,
  weight: 20,
  kind: 'statBoost', power: 1, toughness: 1,
};
STICKERS['innate'] = {
  id: 'innate', name: 'Innate',
  text: 'Starts in your opening hand.',
  appliesTo: (c) => c.type === 'Land',
  stackable: false,
  weight: 10,
  kind: 'innate',
};
// landColor stickers — make a basic land also produce another color. Legal
// only when the deck plays that color. appliesTo reads c.deckColors.
for (const color of ['W','U','B','R','G']) {
  const id = 'landColor_' + color;
  const colorName = { W:'Plains', U:'Island', B:'Swamp', R:'Mountain', G:'Forest' }[color];
  const colorAdj = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' }[color];
  STICKERS[id] = {
    id, name: 'Also a ' + colorName,
    text: 'This land also produces {' + color + '}.',
    appliesTo: (c) => {
      if (c.type !== 'Land') return false;
      if (c.mana === color) return false;                          // already produces it natively
      if ((c.extraManaColors || []).includes(color)) return false;  // already added via sticker
      // Deck-color gate: only offer if deck already plays this color.
      if (c.deckColors && !c.deckColors.includes(color)) return false;
      return true;
    },
    stackable: false,
    weight: 10,                 // baseline
    kind: 'landColor',
    color,
    colorAdj,
  };
}
// Cost reduction — card costs 1 less generic mana to cast. Legal only on
// non-land cards with at least 1 generic mana in their cost AND total cost
// ≥ 2 (so we don't make a 1-drop free). Stackable: each application strips
// another generic, capped by the card's actual generic mana count.
//
// Weight 1 (rare) — cost reduction is genuinely powerful, especially when
// stacked on a bomb. Was briefly bumped to 10 during early playtest to
// see it more often; back at 1 for production.
STICKERS['costMinus1'] = {
  id: 'costMinus1', name: 'Costs 1 Less',
  text: 'This costs {1} less to cast.',
  appliesTo: (c) => {
    if (c.type === 'Land') return false;
    if (!c.cost) return false;
    const generic = c.cost.C || 0;
    if (generic < 1) return false;
    // c.cost reflects prior costMinus1 stickers (stickersFor pre-reduces the
    // view's cost), so generic and total here are CURRENT, not original.
    // Floor at total ≥ 2 prevents reducing cards to free.
    let total = generic;
    for (const k of ['W','U','B','R','G']) total += (c.cost[k] || 0);
    if (total < 2) return false;
    return true;
  },
  stackable: true,
  weight: 1,                   // rare — cost reduction is genuinely powerful
  kind: 'costReduction',
  amount: 1,
};

// Empower bumps one buffable field (location, effect, mode?, field) per
// application, picked uniformly. Roll recorded on slot.empowerRolls at apply
// time for deterministic load.
const EMPOWER_FIELDS = {
  damage:         ['amount'],
  damageAll:      ['amount'],
  pump:           ['power', 'toughness'],
  weaken:         ['power', 'toughness'],
  addCounter:     ['power', 'toughness'],
  pumpAllYours:   ['power', 'toughness'],
  gainLife:       ['amount'],
  draw:           ['amount'],
  discard:        ['amount'],
  removeCreature: ['severity'],
  removeAll:      ['severity'],
  createTokens:   ['count'],
};
function isEmpowerableField(eff, field) {
  if (!eff || !eff.kind) return false;
  const fields = EMPOWER_FIELDS[eff.kind];
  if (!fields || !fields.includes(field)) return false;
  // Severity caps at 4 (single-target removeCreature and mass removeAll).
  if ((eff.kind === 'removeCreature' || eff.kind === 'removeAll') && field === 'severity') {
    return (eff.severity || 1) < 4;
  }
  // Skip {from:...} expression values — can't add 1 without losing semantics.
  const v = eff[field];
  if (typeof v === 'object' && v !== null && 'from' in v) return false;
  return true;
}
// Enumerate every eligible (location, subIdx, effIdx, modeIdx, field) target
// for an Empower roll. Modal effect bundles expand to one entry per
// (mode, effect, field) — each mode is an independent roll target.
function enumerateEmpowerTargets(c) {
  const targets = [];
  const walkEffectsArray = (effs, location, subIdx, modeIdx) => {
    if (!Array.isArray(effs)) return;
    effs.forEach((e, effIdx) => {
      const fields = EMPOWER_FIELDS[e.kind];
      if (!fields) return;
      for (const f of fields) {
        if (isEmpowerableField(e, f)) {
          targets.push({location, subIdx, effIdx, modeIdx, field: f});
        }
      }
    });
  };
  // Top-level effects: either a flat array (most cards) or a modal
  // {modeNames, modes:[[...],[...]]} object (charms).
  const e = c.effects;
  if (Array.isArray(e)) {
    walkEffectsArray(e, 'effects', null, null);
  } else if (e && Array.isArray(e.modes)) {
    e.modes.forEach((modeEffs, modeIdx) => {
      walkEffectsArray(modeEffs, 'effects', null, modeIdx);
    });
  }
  // Triggers' effects (no modal triggers in the current pool, but be defensive).
  if (Array.isArray(c.triggers)) {
    c.triggers.forEach((t, subIdx) => {
      walkEffectsArray(t.effects, 'triggers', subIdx, null);
    });
  }
  // Activated abilities' effects.
  if (Array.isArray(c.abilities)) {
    c.abilities.forEach((a, subIdx) => {
      walkEffectsArray(a.effects, 'abilities', subIdx, null);
    });
  }
  return targets;
}
function hasEmpowerableEffect(c) {
  return enumerateEmpowerTargets(c).length > 0;
}
// Roll a single empower target uniformly from the card template's eligible
// pool. Returns the rolled descriptor (suitable for storing on slot.empowerRolls)
// or null if the card has no empowerable fields. Caller is expected to have
// gated the roll on hasEmpowerableEffect already.
function rollEmpowerTarget(tpl) {
  const targets = enumerateEmpowerTargets(tpl);
  if (targets.length === 0) return null;
  return targets[Math.floor(Math.random() * targets.length)];
}
STICKERS['empower'] = {
  id: 'empower', name: 'Empower',
  text: 'A single number on this card is increased by 1 — rolled when applied. Stack for more rolls.',
  appliesTo: (c) => hasEmpowerableEffect(c),
  stackable: true,
  weight: 10,                  // baseline. Was 50 during early playtest to
                               // pump Empower into nearly every offer pool;
                               // dropped to baseline now that the mechanic
                               // is shipped and stable.
  kind: 'empower',
  amount: 1,
};
// One sticker per keyword. "Has Flying", "Has First strike", etc.
// Display names use sentence case for multi-word keywords (matches MtG's
// modern card-text formatting: "First strike", not "First Strike").
const KEYWORD_DISPLAY = {
  flying: 'Flying', vigilance: 'Vigilance', trample: 'Trample', haste: 'Haste',
  firstStrike: 'First strike', reach: 'Reach', defender: 'Defender',
  indestructible: 'Indestructible', lifelink: 'Lifelink', deathtouch: 'Deathtouch',
  menace: 'Menace', hexproof: 'Hexproof', flash: 'Flash',
  unblockable: 'Unblockable',
};
// Per-keyword sticker offer weight. Higher = more common in pair offers.
// Keeping it minimal for now — tune as we get playtest signal.
//   1 = rare/strong (game-warping when stuck)
//   10 = baseline (everything else)
const KEYWORD_STICKER_WEIGHTS = {
  indestructible: 1, hexproof: 1, unblockable: 1,
  // All other keywords default to 10 below.
};
// Helper for keyword-sticker eligibility on instants/sorceries: does this
// card have any damage-dealing effect? Used to gate lifelink/deathtouch
// stickers — those only make sense on cards that actually deal damage.
// Modal-aware: walks all modes for modal cards, so a Charm with one
// damage mode is eligible for damage-tied stickers.
function spellDealsDamage(c) {
  return ENGINE.cardHasEffect(c, e => e.kind === 'damage');
}

for (const kw of KEYWORDS) {
  // Defender is a downside keyword — never offered as a sticker reward.
  if (kw === 'defender') continue;
  const id = 'kw_' + kw;
  const displayName = KEYWORD_DISPLAY[kw] || (kw.charAt(0).toUpperCase() + kw.slice(1));
  STICKERS[id] = {
    id, name: 'Has ' + displayName,
    text: 'Gains ' + displayName + '.',
    appliesTo: (c) => {
      // Don't offer a keyword the card already has (native or stickered).
      if ((c.keywords || []).includes(kw)) return false;
      if ((c.stickers || []).some(sId => STICKERS[sId] && STICKERS[sId].keyword === kw)) return false;
      // Type-based eligibility:
      //   - Lifelink/Deathtouch/Trample: creatures, OR damaging spells.
      //   - Flash: creatures, OR sorceries (instants are already instant-speed).
      //   - All other keywords: creatures only.
      if (kw === 'lifelink' || kw === 'deathtouch' || kw === 'trample') {
        if (c.type === 'Creature') {
          // OK
        } else if ((c.type === 'Instant' || c.type === 'Sorcery') && spellDealsDamage(c)) {
          // OK
        } else {
          return false;
        }
      } else if (kw === 'flash') {
        if (c.type !== 'Creature' && c.type !== 'Sorcery') return false;
      } else {
        if (c.type !== 'Creature') return false;
      }
      // Reach is only useful as a defensive ground-blocker upgrade — fliers
      // already block fliers, so reach is strictly redundant on them.
      if (kw === 'reach' && (c.keywords || []).includes('flying')) return false;
      return true;
    },
    stackable: false,
    weight: KEYWORD_STICKER_WEIGHTS[kw] || 10,
    kind: 'keyword',
    keyword: kw,
  };
}
// Subtype sticker — adds a creature subtype rolled from the player's deck,
// weighted by token frequency. Roll excludes subtypes the target already
// has, so it can't be inert. Storage mirrors Empower: rolls live on
// slot.subtypeRolls in parallel to 'subtype' occurrences in slot.stickers.
//
// Use cases: triggering tribal lord buffs, satisfying tribal search/recursion.
// Subs are space-joined and word-boundary-matched, so "Human Wizard" can
// gain "Goblin" and pick up Goblin lord buffs while still being a Wizard.
STICKERS['subtype'] = {
  id: 'subtype', name: 'Subtype',
  text: 'This creature gains a random creature subtype drawn from your deck.',
  appliesTo: (c) => c.type === 'Creature',
  stackable: true,
  weight: 10,
  kind: 'subtype',
};
// Scarified — boss-only sticker applied by Scarification. Adds an ETB
// trigger to the creature: each time it enters the battlefield, the
// controller loses 1 life. Persistent across the run (sticker lives on
// the slot), so a scarred creature haunts the player for many games.
// weight: 0 — never appears in normal reward pools, only applied by the
// dedicated effect. appliesTo restricts to Creatures for safety.
STICKERS['scarified'] = {
  id: 'scarified', name: 'Scarred',
  text: 'When this enters the battlefield, its controller loses 1 life.',
  appliesTo: (c) => c.type === 'Creature',
  stackable: true,         // multiple scarifications stack — each fires on ETB
  weight: 0,               // not in random pools
  kind: 'trigger',
  trigger: {
    event: 'cardEntersBattlefield',
    condId: 'thisEnters',
    text: '~ enters: its controller loses 1 life.',
    // target:'self' for player-operating effects (damage/gainLife/discard/
    // draw) resolves to the source's controller at trigger time. Pushed
    // onto card.triggers when the sticker applies via the standard
    // sticker-trigger path at line 2705-2706.
    effects: [{ kind: 'damage', target: 'self', amount: 1 }],
  },
};


// =========================================================================
// RUN MODIFIERS — Neow-style run-defining choices presented before draft.
// Each modifier: {id, name, text, apply()}. apply() returns {extras: [{tplId,
// stickers}, ...]} for bonus deck slots; pure (no runState mutation).
// Future hooks (stickerBias, lifeOffset, etc) can be added similarly.
// =========================================================================
const RUN_MODIFIERS = {};
RUN_MODIFIERS['cityOfBrass'] = {
  id: 'cityOfBrass',
  name: 'Polychrome Pact',
  text: 'Begin your run with a City of Brass already in hand. Taps for any color.',
  art: '🏛',
  // Pinned during early development to guarantee a universally-applicable
  // boon was always available. Now unpinned — competes with other boons
  // in the random rotation. Re-pin if a future round of playtest signals
  // that the boon pool has grown disjoint enough that a stable fallback
  // is needed again.
  apply: () => ({
    extras: [{ tplId: 'cityOfBrass', stickers: ['innate'] }],
  }),
};
RUN_MODIFIERS['endomorph'] = {
  id: 'endomorph',
  name: 'The Hungering Mimic',
  text: 'Begin your run with Endomorph in your deck — a 2-mana 2/2 that permanently absorbs a keyword from each creature it kills (or +1/+1 if it can\'t).',
  art: '🧬',
  apply: () => ({
    extras: [{ tplId: 'endomorph', stickers: [] }],
  }),
};
RUN_MODIFIERS['steal'] = {
  id: 'steal',
  name: 'The Long Heist',
  text: 'Begin your run with Steal in your deck — a 5-mana instant that counters target spell or takes target permanent, putting it into your library forever.',
  art: '🪄',
  apply: () => ({
    extras: [{ tplId: 'steal', stickers: [] }],
  }),
};
RUN_MODIFIERS['phylactery'] = {
  id: 'phylactery',
  name: 'Phylactery',
  text: "Begin your run with a Phylactery (Swamp, in opening hand). You can't lose to 0 life or to decking out — each damage past zero or would-be overdraw rips a slot from your deck instead. Phylactery itself is always ripped last.",
  art: '💀',
  apply: () => ({
    extras: [{ tplId: 'phylactery', stickers: ['innate'] }],
  }),
};
RUN_MODIFIERS['elystra'] = {
  id: 'elystra',
  name: 'Elystra the Immortal',
  text: "Begin your run with Elystra in your deck — a 3-mana 1/1. End-of-turn effects on her last forever, but every spell that targets her is ripped from its caster's deck after it resolves.",
  art: '👻',
  // v1.0.48: unpinned. Was pinned because Elystra was the headline build-around
  // and players wanted reliable access; with the pool grown (Codex, Mercurial,
  // others now competitive), guaranteed visibility crowds out exploration of
  // the other boons. Re-pin if the pool shrinks or Elystra-stacking runs
  // become so dominant that players regularly skip whatever boon got rolled.
  apply: () => ({
    extras: [{ tplId: 'elystra', stickers: [] }],
  }),
};

RUN_MODIFIERS['stapler'] = {
  id: 'stapler',
  name: 'Stapler',
  text: "Begin your run with Stapler — a {3} Artifact with 3 per-run charges. {3}, T: choose two target permanents, staple the second onto the first. When out of charges, ripped from the run.",
  art: '📎',
  // Charges initialize from CARDS.stapler.chargesAtRunStart (= 3) via the
  // extras-loop in start(). Persist across games on slot.charges.
  // v1.0.68: unpinned. Was pinned during initial playtesting (v1.0.52) to
  // collect feedback on the in-game splice flow; mechanic is now stable
  // across many versions (charges/persistence/all 4 splice cases including
  // lands, double-staple guard, live-text updates, combat-state transfer).
  // Re-pin if the splice rewrite uncovers regressions.
  apply: () => ({
    extras: [{ tplId: 'stapler', stickers: [] }],
  }),
};

