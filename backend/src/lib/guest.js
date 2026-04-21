const crypto = require('crypto');

const adjectives = [
  'Amber', 'Ancient', 'Arctic', 'Autumn', 'Azure', 'Bamboo', 'Brave', 'Bright', 'Bronze', 'Calm',
  'Candid', 'Cedar', 'Cheerful', 'Clever', 'Cloudy', 'Copper', 'Cosmic', 'Crimson', 'Crystal', 'Daring',
  'Dawn', 'Deep', 'Drift', 'Dusky', 'Electric', 'Emerald', 'Evening', 'Fair', 'Feral', 'Fierce',
  'Forest', 'Frosty', 'Gentle', 'Gilded', 'Golden', 'Grand', 'Granite', 'Green', 'Happy', 'Harbor',
  'Hidden', 'Honey', 'Humble', 'Indigo', 'Ivory', 'Jade', 'Kind', 'Lake', 'Lavender', 'Lively',
  'Lunar', 'Maple', 'Marble', 'Meadow', 'Merry', 'Midnight', 'Misty', 'Mountain', 'Neon', 'Nimble',
  'Noble', 'Northern', 'Ocean', 'Olive', 'Opal', 'Orange', 'Pacific', 'Pearl', 'Pepper', 'Pine',
  'Plucky', 'Prairie', 'Quiet', 'Rapid', 'Red', 'River', 'Royal', 'Ruby', 'Rustic', 'Saffron',
  'Sage', 'Sandy', 'Scarlet', 'Silver', 'Sky', 'Solar', 'Spark', 'Spring', 'Starry', 'Stone',
  'Stormy', 'Sunny', 'Swift', 'Teal', 'Tender', 'Thunder', 'Tiny', 'Topaz', 'Velvet', 'Verdant',
  'Violet', 'Warm', 'Wild', 'Winter', 'Wise', 'Wooden', 'Yellow', 'Young', 'Zephyr', 'Zesty',
  'Agile', 'Brisk', 'Chill', 'Coral', 'Dapper', 'Eager', 'Fancy', 'Glowing', 'Hazel', 'Icy',
  'Jolly', 'Keen', 'Lucky', 'Magic', 'Nova', 'Polished', 'Quick', 'Raven', 'Shady', 'Tidal',
  'Upbeat', 'Vivid', 'Witty', 'Zinc', 'Bold', 'Clear', 'Dreamy', 'Feather', 'Graceful', 'Honest',
  'Lucid', 'Mellow', 'Patient', 'Radial', 'Smooth', 'Twilight', 'Urban', 'Wavy', 'Fresh', 'Quietly',
  'Brilliant', 'Casual', 'Distant', 'Earnest', 'Friendly', 'Glacial', 'Harmonic', 'Infinite', 'Joyful', 'Kinetic',
  'Lofty', 'Modern', 'Natural', 'Open', 'Playful', 'Quirky', 'Restless', 'Soft', 'True', 'Untamed',
  'Valiant', 'Wandering', 'Xenial', 'Yearly', 'Zen', 'Blazing', 'Coastal', 'Desert', 'Eastern', 'Floating',
  'Garden', 'Highland', 'Island', 'Juniper', 'Lagoon', 'Marine', 'Orchid', 'Pebble', 'Rainy', 'Summit',
  'Timber', 'Unity', 'Voyage', 'Willow', 'Yonder', 'Zonal', 'Freshest', 'Kindred', 'Lucent', 'Prism',
  'Ribbon', 'Signal', 'Torch', 'Umber', 'Verve', 'Wonder', 'Anchor', 'Beacon', 'Canvas', 'Delta'
];

const animals = [
  'Alpaca', 'Antelope', 'Badger', 'Barracuda', 'Bear', 'Beaver', 'Bison', 'Bobcat', 'Camel', 'Capybara',
  'Caribou', 'Cheetah', 'Condor', 'Cougar', 'Crane', 'Dolphin', 'Eagle', 'Falcon', 'Ferret', 'Finch',
  'Fox', 'Gazelle', 'Gecko', 'Gibbon', 'Goose', 'Hawk', 'Heron', 'Ibex', 'Jaguar', 'Jay',
  'Koala', 'Lemur', 'Leopard', 'Lion', 'Llama', 'Lynx', 'Marten', 'Meerkat', 'Moose', 'Narwhal',
  'Newt', 'Ocelot', 'Orca', 'Otter', 'Owl', 'Panda', 'Panther', 'Parrot', 'Penguin', 'Pika',
  'Puma', 'Quail', 'Rabbit', 'Raven', 'Redpoll', 'Salmon', 'Seal', 'Shark', 'Skylark', 'Sloth',
  'Sparrow', 'Stoat', 'Swan', 'Tapir', 'Tiger', 'Toucan', 'Trout', 'Turtle', 'Viper', 'Walrus',
  'Weasel', 'Whale', 'Wolf', 'Wombat', 'Yak', 'Zebra', 'Aardvark', 'Ape', 'Armadillo', 'Avocet',
  'Bat', 'Bee', 'Bonobo', 'Buffalo', 'Bulbul', 'Cat', 'Chamois', 'Cobra', 'Coyote', 'Crow',
  'Deer', 'Dingo', 'Dove', 'Duck', 'Eel', 'Elk', 'Emu', 'Fossa', 'Frog', 'Gannet',
  'Gaur', 'Gerbil', 'Giraffe', 'Gnu', 'Goral', 'Grouse', 'Gull', 'Hare', 'Hedgehog', 'Hornbill',
  'Horse', 'Hyena', 'Ibis', 'Impala', 'Jackal', 'Kestrel', 'Kite', 'Kiwi', 'Kudu', 'Lapwing',
  'Lark', 'Lizard', 'Macaque', 'Magpie', 'Mink', 'Mole', 'Monkey', 'Myna', 'Okapi', 'Opossum',
  'Oryx', 'Pelican', 'Plover', 'Porpoise', 'Quetzal', 'Raccoon', 'Ram', 'Robin', 'Sable', 'Serval',
  'Sheep', 'Shrew', 'Skink', 'Snipe', 'Stork', 'Tamarin', 'Tarsier', 'Tern', 'Thrush', 'Toad',
  'Tuna', 'Vole', 'Vulture', 'Wallaby', 'Wren', 'Zebu', 'Anole', 'Binturong', 'Chinchilla', 'Dormouse',
  'Egret', 'Flamingo', 'Galago', 'Hamster', 'Inchworm', 'Jerboa', 'Kingfisher', 'Langur', 'Manatee', 'Nuthatch',
  'Peafowl', 'Quokka', 'Roebuck', 'Seahorse', 'Tanager', 'Urial', 'Vaquita', 'Woodpecker', 'Xerus', 'Yellowhammer',
  'Auk', 'Boar', 'Caiman', 'Dragonfly', 'Elephant', 'Firefly', 'Grasshopper', 'Hoopoe', 'Jellyfish', 'Krill',
  'Lobster', 'Marmot', 'Nightingale', 'Octopus', 'Puffin', 'Rook', 'Starling', 'Termite', 'Urchin', 'Vicuna'
];

function randomItem(items) {
  return items[crypto.randomInt(items.length)];
}

function generateDisplayName() {
  return `${randomItem(adjectives)} ${randomItem(animals)}`;
}

function generateUlid() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let time = Date.now();
  let id = '';

  for (let i = 0; i < 10; i += 1) {
    id = alphabet[time % 32] + id;
    time = Math.floor(time / 32);
  }

  const bytes = crypto.randomBytes(10);
  let random = BigInt(`0x${bytes.toString('hex')}`);
  let suffix = '';
  for (let i = 0; i < 16; i += 1) {
    suffix = alphabet[Number(random % 32n)] + suffix;
    random /= 32n;
  }

  return id + suffix;
}

module.exports = {
  generateDisplayName,
  generateUlid,
};
