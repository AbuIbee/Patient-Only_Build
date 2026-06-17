import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, ChevronLeft, CheckCircle2, Shuffle, AlertCircle, Sparkles, BookOpen } from "lucide-react";

// EXTENSIVE PATIENT-OPTIMIZED DICTIONARY (500 DISTINCT SELECTIONS)
// Categories: Nature, Comfort, Food, Sensory Memories, Domestic Life, Positive Emotions, Wellness
const CW_CLUES = [
  { word: 'HOME', clue: 'Where you live, feel safe, and sleep' },
  { word: 'LOVE', clue: 'A deep caring feeling for family and friends' },
  { word: 'SUN', clue: 'The bright star that warms our outdoor days' },
  { word: 'RAIN', clue: 'Water falling gently from clouds to plants' },
  { word: 'TREE', clue: 'Tall plant with branches, roots, and green leaves' },
  { word: 'BIRD', clue: 'An animal that flies, nests, and sings' },
  { word: 'BOOK', clue: 'Pages filled with stories or helpful information' },
  { word: 'ROSE', clue: 'A beautiful sweet-smelling flower with thorns' },
  { word: 'HOPE', clue: 'Belief that good things will come tomorrow' },
  { word: 'CALM', clue: 'Feeling totally relaxed, quiet, and at peace' },
  { word: 'HAND', clue: 'Body part used to hold, wave, or write' },
  { word: 'LAKE', clue: 'A large body of still water surrounded by trees' },
  { word: 'SONG', clue: 'Music you sing aloud or listen to with words' },
  { word: 'DOOR', clue: 'You open this to walk inside a room' },
  { word: 'STAR', clue: 'Bright point of light seen in the night sky' },
  { word: 'CAKE', clue: 'Sweet baked treat often shared at birthdays' },
  { word: 'FIRE', clue: 'Hot bright flames that warm up a fireplace' },
  { word: 'GIFT', clue: 'A present given to someone with kindness' },
  { word: 'NEST', clue: 'A small home a bird builds out of twigs' },
  { word: 'PATH', clue: 'A trail you walk along through a park' },
  { word: 'MOON', clue: 'The silver orb glowing in the night sky' },
  { word: 'FARM', clue: 'Land where fruits, vegetables, and cows are raised' },
  { word: 'JOY', clue: 'A wonderful feeling of pure happiness' },
  { word: 'ART', clue: 'Creative expressions like paintings and drawings' },
  { word: 'GRACE', clue: 'Moving elegantly or a warm blessing' },
  { word: 'SOUP', clue: 'Warm, comforting liquid food eaten with a spoon' },
  { word: 'MILK', clue: 'A cold, nutritious white drink from a glass' },
  { word: 'CHAIR', clue: 'A piece of furniture you sit down on' },
  { word: 'SMILE', clue: 'A happy expression you make with your lips' },
  { word: 'SLEEP', clue: 'Resting your eyes all night to recharge' },
  { word: 'WAVE', clue: 'Moving your hand side-to-side to say hello' },
  { word: 'KIND', clue: 'Showing a friendly and helpful nature' },
  { word: 'APPLE', clue: 'Crisp, sweet round fruit that grows on trees' },
  { word: 'BREAD', clue: 'Soft baked food used to make sandwiches' },
  { word: 'COFFEE', clue: 'Warm, aromatic brewed morning beverage' },
  { word: 'TEA', clue: 'Steeped herbal leaf drink served in a cup' },
  { word: 'STOVE', clue: 'Kitchen appliance used to cook meals' },
  { word: 'DISH', clue: 'A plate or shallow bowl for holding food' },
  { word: 'DESK', clue: 'A table you sit at to read, write, or work' },
  { word: 'LIGHT', clue: 'Flip a switch to turn this on when it dark' },
  { word: 'CLOCK', clue: 'Device on the wall that shows the hour' },
  { word: 'WATCH', clue: 'Small timepiece worn around your wrist' },
  { word: 'SHIRT', clue: 'Clothing worn on the upper half of the body' },
  { word: 'SHOES', clue: 'Footwear worn before going outside' },
  { word: 'COAT', clue: 'Heavy outer garment worn when it is cold' },
  { word: 'SOCKS', clue: 'Soft clothing worn inside your boots' },
  { word: 'YARD', clue: 'Grassy outdoor area right behind a house' },
  { word: 'CAT', clue: 'A furry pet that purrs and catches mice' },
  { word: 'DOG', clue: 'A loyal pet companion that barks and wags its tail' },
  { word: 'FISH', clue: 'An animal that swims underwater with fins' },
  { word: 'FROG', clue: 'Green amphibian that leaps and croaks' },
  { word: 'DUCK', clue: 'Water bird that quacks and swims in ponds' },
  { word: 'POND', clue: 'Small body of water, home to frogs and lily pads' },
  { word: 'BOAT', clue: 'Small vehicle used to travel across water' },
  { word: 'SHIP', clue: 'Very large vessel that travels across oceans' },
  { word: 'TRAIN', clue: 'Long vehicle that rides along metal tracks' },
  { word: 'ROAD', clue: 'Paved street where cars drive safely' },
  { word: 'PARK', clue: 'Public green area filled with trees and benches' },
  { word: 'LEAF', clue: 'Green item falling from a tree branch in autumn' },
  { word: 'SEED', clue: 'Small item planted in dirt to grow a plant' },
  { word: 'SOIL', clue: 'Rich brown dirt where garden vegetables grow' },
  { word: 'RAINBOW', clue: 'Colorful arch seen in sky after a rainstorm' },
  { word: 'WIND', clue: 'Moving air that blows flags and rustles trees' },
  { word: 'SNOW', clue: 'Cold white flakes that fall during winter' },
  { word: 'ICE', clue: 'Water that has frozen solid and cold' },
  { word: 'COUCH', clue: 'Long comfortable seat for several people to sit' },
  { word: 'LAMP', clue: 'Light source placed sitting on a side table' },
  { word: 'BED', clue: 'Furniture item with pillows for sleeping' },
  { word: 'QUILT', clue: 'Thick patterned blanket stitched together' },
  { word: 'PILLOW', clue: 'Soft cushion to rest your head on at night' },
  { word: 'ROOF', clue: 'The protective top covering of a house' },
  { word: 'WALL', clue: 'Vertical structure enclosing a living room' },
  { word: 'WINDOW', clue: 'Glass pane you look through to see outside' },
  { word: 'GATE', clue: 'Hinged door through an outdoor backyard fence' },
  { word: 'TOWEL', clue: 'Soft fabric sheet used to dry off after bathing' },
  { word: 'SOAP', clue: 'Scented cleaner used with water to wash hands' },
  { word: 'COMB', clue: 'Toothed plastic tool used to style your hair' },
  { word: 'SPOON', clue: 'Utensil used to eat cereal or hot soup' },
  { word: 'FORK', clue: 'Pronged utensil used to spear food on a plate' },
  { word: 'KNIFE', clue: 'Utensil used in the kitchen to slice food' },
  { word: 'CUP', clue: 'Handheld vessel used to sip water or juice' },
  { word: 'BOWL', clue: 'Round deep container ideal for breakfast oatmeal' },
  { word: 'JUICE', clue: 'Sweet beverage squeezed from fruits like oranges' },
  { word: 'WATER', clue: 'Clear fluid essential to drink every single day' },
  { word: 'FRUIT', clue: 'Healthy sweet snacks like berries and bananas' },
  { word: 'PEAR', clue: 'Sweet bell-shaped fruit, green or yellow' },
  { word: 'PLUM', clue: 'Small round juicy fruit with purple skin' },
  { word: 'PEACH', clue: 'Fuzzy-skinned sweet summer fruit with a pit' },
  { word: 'GRAPE', clue: 'Small round fruit growing in vine clusters' },
  { word: 'BERRY', clue: 'Tiny juicy fruit like a strawberry or blueberry' },
  { word: 'MELON', clue: 'Large juicy fruit like a sweet watermelon' },
  { word: 'HONEY', clue: 'Sweet golden liquid produced by busy bees' },
  { word: 'SUGAR', clue: 'White crystals used to sweeten baking recipes' },
  { word: 'SALT', clue: 'White seasoning mineral used to enhance savory food' },
  { word: 'PEA', clue: 'Small round green vegetable found in a pod' },
  { word: 'BEAN', clue: 'Nutritious pod seed like green or baked variety' },
  { word: 'CORN', clue: 'Yellow kernels that grow on a tall stalk cob' },
  { word: 'POTATO', clue: 'Starchy root vegetable used to make stews or mash' },
  { word: 'ONION', clue: 'Layered bulb vegetable that can make you cry' },
  { word: 'CARROT', clue: 'Bright orange crunchy root vegetable' },
  { word: 'RICE', clue: 'Small white grains cooked as a side dish base' },
  { word: 'MEAL', clue: 'Breakfast, lunch, or dinner gathering' },
  { word: 'PLATE', clue: 'Flat round dish where your main course sits' },
  { word: 'OVEN', clue: 'Heated chamber appliance used for baking foods' },
  { word: 'PAN', clue: 'Metal cookware vessel with a long handle' },
  { word: 'POT', clue: 'Deep metal cookware used to boil water' },
  { word: 'CHEF', clue: 'Professional person who cooks delicious food' },
  { word: 'BAKER', clue: 'Person who prepares breads, cakes, and pastries' },
  { word: 'GARDEN', clue: 'Plot of ground filled with flowers or vegetables' },
  { word: 'PLANT', clue: 'Living organism like a shrub, herb, or tree' },
  { word: 'FLOWER', clue: 'Blossom plant with colorful delicate petals' },
  { word: 'TULIP', clue: 'Cup-shaped colorful flower blooming in spring' },
  { word: 'DAISY', clue: 'Cheerful flower with white petals and yellow center' },
  { word: 'FERN', clue: 'Feathery green plant that thrives in shady spots' },
  { word: 'MOSS', clue: 'Soft low green carpet plant growing on rocks' },
  { word: 'ROOT', clue: 'Underground plant part absorbing water and nutrients' },
  { word: 'STEM', clue: 'Main stalk supporting a plant leaf or flower' },
  { word: 'BARK', clue: 'The rough outer skin of a mature tree trunk' },
  { word: 'WOOD', clue: 'Hard fibrous material trees are made of' },
  { word: 'FOREST', clue: 'Large expansive area covered completely by trees' },
  { word: 'WOODS', clue: 'A small forest space suitable for gentle hikes' },
  { word: 'HILL', clue: 'Raised land mass smaller than a high mountain' },
  { word: 'VALLEY', clue: 'Low flat land stretching between two hills' },
  { word: 'RIVER', clue: 'Flowing ribbon of freshwater moving to the sea' },
  { word: 'CREEK', clue: 'Small shallow stream of flowing water' },
  { word: 'OCEAN', clue: 'Vast body of blue salty water covering earth' },
  { word: 'SEA', clue: 'Large expanse of salt water connected to oceans' },
  { word: 'BEACH', clue: 'Sandy shoreline bordering ocean waves' },
  { word: 'SAND', clue: 'Tiny grains of worn rock lining ocean beaches' },
  { word: 'SHELL', clue: 'Hard protective cover left behind by sea snails' },
  { word: 'WAVE', clue: 'Crest of water rolling across the ocean surface' },
  { word: 'SKY', clue: 'The upper atmosphere where clouds drift along' },
  { word: 'CLOUD', clue: 'Fluffy white condensation mass floating in sky' },
  { word: 'STORM', clue: 'Weather system with high rain, wind, or thunder' },
  { word: 'SHADE', clue: 'Cool area protected directly from bright sunlight' },
  { word: 'DAWN', clue: 'The early morning period when the sun appears' },
  { word: 'NOON', clue: 'Twelve o-clock midday when the sun is directly above' },
  { word: 'DUSK', clue: 'The peaceful evening transition time before dark' },
  { word: 'NIGHT', clue: 'The dark hours when stars gleam and we sleep' },
  { word: 'WEEK', clue: 'A calendar block spanning seven consecutive days' },
  { word: 'MONTH', clue: 'A calendar division lasting around thirty days' },
  { word: 'YEAR', clue: 'Time taken for earth to orbit the sun once' },
  { word: 'SPRING', clue: 'Season when snow melts and flowers start to bloom' },
  { word: 'SUMMER', clue: 'Warmest calendar season with long sunny afternoons' },
  { word: 'AUTUMN', clue: 'Season when leaves change color and fall down' },
  { word: 'WINTER', clue: 'Coldest season characterized by frost and snow' },
  { word: 'MIND', clue: 'Your center of thoughts, memory, and awareness' },
  { word: 'SOUL', clue: 'The inner spiritual essence of a unique person' },
  { word: 'HEART', clue: 'Internal organ pumping blood or symbol of love' },
  { word: 'BODY', clue: 'The physical structure of a human person' },
  { word: 'LIFE', clue: 'The wonderful state of living and breathing' },
  { word: 'PEACE', clue: 'A state of serene quiet and deep harmony' },
  { word: 'TRUTH', clue: 'Honest facts that are verified and completely real' },
  { word: 'FAITH', clue: 'Strong belief or trust in something good' },
  { word: 'TRUST', clue: 'Relying firmly on the honesty of a true friend' },
  { word: 'KIND', clue: 'Caring behaviors shown toward other patients' },
  { word: 'SMILE', clue: 'An upturned facial expression of genuine warmth' },
  { word: 'LAUGH', clue: 'Sounds of amusement made when hearing a good joke' },
  { word: 'CHEER', clue: 'Optimism or happiness brought to support friends' },
  { word: 'GENTLE', clue: 'Mild, soft, and careful touch or voice' },
  { word: 'SWEET', clue: 'Sugary taste quality found in honey or candies' },
  { word: 'SOFT', clue: 'Pliable smooth texture like velvet or a pillow' },
  { word: 'WARM', clue: 'Comfortable temperature level slightly above cool' },
  { word: 'COOL', clue: 'Refreshing mild temperature typical of autumn' },
  { word: 'FRESH', clue: 'Newly gathered items or crisp morning air' },
  { word: 'PURE', clue: 'Clean material unmixed with anything lesser' },
  { word: 'DEAR', clue: 'Much loved and highly esteemed close family member' },
  { word: 'FRIEND', clue: 'A cherished person you enjoy talking with' },
  { word: 'PAL', clue: 'A casual, friendly term for a close buddy' },
  { word: 'MATE', clue: 'A lifelong partner or reliable companion' },
  { word: 'TEAM', clue: 'Group of people working together for one goal' },
  { word: 'FAMILY', clue: 'Parents, children, and relatives who support you' },
  { word: 'MOTHER', clue: 'A loving female parent who nurtures children' },
  { word: 'FATHER', clue: 'A caring male parent who guides children' },
  { word: 'SISTER', clue: 'A female sibling sharing parents and memories' },
  { word: 'BROTHER', clue: 'A male sibling sharing family backgrounds' },
  { word: 'CHILD', clue: 'A young human boy or girl full of curiosity' },
  { word: 'BABY', clue: 'An infant requiring careful rocking and cradling' },
  { word: 'GRAND', clue: 'Magnificent scale or noble stately generation' },
  { word: 'AUNT', clue: 'The supportive sister of your mother or father' },
  { word: 'UNCLE', clue: 'The helpful brother of your mother or father' },
  { word: 'NEIGHBOR', clue: 'Person living in the house or room next door' },
  { word: 'GUEST', clue: 'A visitor welcome to share hospitality inside' },
  { word: 'HOST', clue: 'Person receiving and entertaining visitors' },
  { word: 'HERO', clue: 'Admired figure known for courage or help' },
  { word: 'GUIDE', clue: 'Person showing the correct pathway forward' },
  { word: 'DOCTOR', clue: 'Medical specialist helping you feel much better' },
  { word: 'NURSE', clue: 'Care provider administering medicines and comfort' },
  { word: 'HEALER', clue: 'Compassionate individual helping restore complete wellness' },
  { word: 'HEALTH', clue: 'Optimal state of physical and mental well-being' },
  { word: 'CURE', clue: 'A complete remedy restoring health after sickness' },
  { word: 'CARE', clue: 'Attentive oversight ensuring someone feels safe' },
  { word: 'HELP', clue: 'Assistance offered freely to ease someone load' },
  { word: 'AID', clue: 'Support tools or basic medical relief supplies' },
  { word: 'REST', clue: 'Taking a quiet intermission to regain energy' },
  { word: 'WALK', clue: 'Moving on foot at a steady, leisurely pace' },
  { word: 'STEP', clue: 'A single foot movement made forward while walking' },
  { word: 'RUN', clue: 'Moving rapidly on foot for brisk exercise' },
  { word: 'JUMP', clue: 'Pushing off the ground with feet momentarily' },
  { word: 'LEAP', clue: 'Bounding forward into the air gracefully' },
  { word: 'SWIM', clue: 'Moving through refreshing pool water using arms' },
  { word: 'DANCE', clue: 'Rhythmic body movements tuned to beautiful music' },
  { word: 'SING', clue: 'Vocalizing musical notes in a direct sequence' },
  { word: 'PLAY', clue: 'Engaging in recreation or fun puzzle activities' },
  { word: 'GAME', clue: 'An interactive structured pastime played for fun' },
  { word: 'TOY', clue: 'Recreational object enjoyed thoroughly by children' },
  { word: 'DOLL', clue: 'Human figure toy used in childhood play scenarios' },
  { word: 'BALL', clue: 'Round bounce toy rolled or thrown across yards' },
  { word: 'KITE', clue: 'Lightweight paper frame flown in high breezy skies' },
  { word: 'BIKE', clue: 'Two-wheeled vehicle propelled along path pedals' },
  { word: 'CAR', clue: 'Four-wheeled vehicle driven along open roadways' },
  { word: 'BUS', clue: 'Large passenger vehicle stopping along route streets' },
  { word: 'PLANE', clue: 'Winged aerial craft soaring high above clouds' },
  { word: 'JET', clue: 'Swift aircraft powered by reactive combustion streams' },
  { word: 'TOWN', clue: 'Populated area smaller than a crowded city' },
  { word: 'CITY', clue: 'Large urban hub filled with shops and skyscrapers' },
  { word: 'STATE', clue: 'Regional territory governed as part of a country' },
  { word: 'LAND', clue: 'Solid ground surfaces distinct from deep seas' },
  { word: 'WORLD', clue: 'The entire planet earth we inhabit collectively' },
  { word: 'EARTH', clue: 'Our home planet, third rock from the central sun' },
  { word: 'GLOBE', clue: 'A spherical map model of our whole planet' },
  { word: 'SPACE', clue: 'The vast expanse beyond earth atmosphere stars' },
  { word: 'STARS', clue: 'Twinkling lights scattered across dark night skies' },
  { word: 'PLANET', clue: 'Large celestial sphere orbiting a central star' },
  { word: 'SKY', clue: 'Blue expanse visible directly overhead outdoors' },
  { word: 'AIR', clue: 'Invisible gas mixture we inhale every second' },
  { word: 'GAS', clue: 'Vapor substance distinct from solids and liquids' },
  { word: 'OIL', clue: 'Slippery nutrient liquid used to saute foods' },
  { word: 'FUEL', clue: 'Energy source burned to operate engines or stoves' },
  { word: 'COAL', clue: 'Dark fossil fuel chunk burned for early trains' },
  { word: 'IRON', clue: 'Strong foundational metal used to build bridges' },
  { word: 'GOLD', clue: 'Precious shiny yellow metal used for fine rings' },
  { word: 'SILVER', clue: 'Gleaming white metal used to forge fine spoons' },
  { word: 'STONE', clue: 'Hard solid mineral piece gathered off paths' },
  { word: 'ROCK', clue: 'Large geological formation rising out of dirt' },
  { word: 'CLAY', clue: 'Sticky earth compound molded into pottery bowls' },
  { word: 'SAND', clue: 'Granular debris lining desert dunes and shores' },
  { word: 'DUST', clue: 'Fine airborne earth particles settling on shelves' },
  { word: 'MUD', clue: 'Wet squishy soil mixture created by rain showers' },
  { word: 'COW', clue: 'Gentle barnyard animal producing fresh dairy milk' },
  { word: 'MILK', clue: 'Creamy wholesome drink packed with calcium' },
  { word: 'BUTTER', clue: 'Rich dairy spread churned from rich cream layers' },
  { word: 'CHEESE', clue: 'Solid dairy food topping crackers or pizzas' },
  { word: 'CREAM', clue: 'Fatty dairy layer skimmed off fresh milk yields' },
  { word: 'YOGURT', clue: 'Tart cultured dairy food often mixed with fruit' },
  { word: 'EGG', clue: 'Oval breakfast protein source laid by chickens' },
  { word: 'HEN', clue: 'Female barnyard bird producing fresh table eggs' },
  { word: 'ROOSTER', clue: 'Male barnyard bird waking farms at dawn breaks' },
  { word: 'CHICK', clue: 'Tiny fuzzy yellow baby bird following a hen' },
  { word: 'GOOSE', clue: 'Large water bird known to honk loud near lakes' },
  { word: 'SWAN', clue: 'Elegant long-necked white bird gliding on water' },
  { word: 'OWL', clue: 'Wise nocturnal bird that hoots from tree branches' },
  { word: 'HAWK', clue: 'Sharp-eyed hunting bird soaring above open fields' },
  { word: 'EAGLE', clue: 'Majestic symbol bird building nests on high cliffs' },
  { word: 'DEER', clue: 'Gentle woodland animal with soft spots or antlers' },
  { word: 'FAWN', clue: 'Baby deer resting quietly hidden in tall grasses' },
  { word: 'BEAR', clue: 'Large furry forest mammal that loves sweet honey' },
  { word: 'FOX', clue: 'Clever rust-colored mammal with a bushy tail' },
  { word: 'WOLF', clue: 'Wild canine pack member howling at full moons' },
  { word: 'LION', clue: 'Proud majestic wild cat ruling African plains' },
  { word: 'TIGER', clue: 'Large orange wild cat patterned with black stripes' },
  { word: 'CAT', clue: 'Small purring feline friend who loves nap spots' },
  { word: 'KITTEN', clue: 'Playful baby cat chasing yarn rolls around' },
  { word: 'PUPPY', clue: 'Energetic baby dog chewing toys and learning pads' },
  { word: 'HOUND', clue: 'Long-eared scent tracking dog lineage breed' },
  { word: 'PET', clue: 'Animal companion kept indoors for joy and comfort' },
  { word: 'LAMB', clue: 'Gentle baby sheep covered in soft white wool' },
  { word: 'SHEEP', clue: 'Flock animal producing valuable fleece coats' },
  { word: 'WOOL', clue: 'Warm fluffy fiber spun to weave winter sweaters' },
  { word: 'YARN', clue: 'Strand of wool bundle used by knitting hobbyists' },
  { word: 'NEEDLE', clue: 'Slender pointed tool used to thread fabric seams' },
  { word: 'THREAD', clue: 'Thin fiber string wound onto sewing bobbins' },
  { word: 'CLOTH', clue: 'Woven fabric material tailored into comfortable shirts' },
  { word: 'SILK', clue: 'Luxury smooth fabric spun by specialized worms' },
  { word: 'SATIN', clue: 'Glossy fabric weave that feels exceptionally sleek' },
  { word: 'COTTON', clue: 'Fluffy plant fiber used for breathable fabrics' },
  { word: 'LINEN', clue: 'Cool crisp summer fabric woven from flax stems' },
  { word: 'FLAG', clue: 'Patterned fabric sheet waving atop metal poles' },
  { word: 'SAIL', clue: 'Fabric sheet catching wind gusts to propel boats' },
  { word: 'ROPE', clue: 'Thick twisted cord line used to tie ships securely' },
  { word: 'KNOT', clue: 'Secure loop tie configuration made with cords' },
  { word: 'NET', clue: 'Mesh fabric system used to gather river trout' },
  { word: 'FISH', clue: 'Scaly aquatic animal gill breathing underwater' },
  { word: 'FIN', clue: 'Stabilizing appendage used by fish to guide path' },
  { word: 'TAIL', clue: 'Rear appendage wagged by excited friendly dogs' },
  { word: 'WING', clue: 'Feathered limb structure flapping to lift birds' },
  { word: 'BEAK', clue: 'Hard pointed mouth component of singing birds' },
  { word: 'CAGE', clue: 'Enclosure used to house pet parakeets safely' },
  { word: 'ZOOM', clue: 'To speed along or adjust lens focus closely' },
  { word: 'LENS', clue: 'Curved glass piece built into spectacles or cameras' },
  { word: 'GLASS', clue: 'Brittle transparent compound ideal for windows' },
  { word: 'MIRROR', clue: 'Reflective surface show glass ideal for grooming' },
  { word: 'IMAGE', clue: 'Visual picture reflection captured on photo prints' },
  { word: 'PHOTO', clue: 'Camera picture saving family memory snapshots' },
  { word: 'FRAME', clue: 'Decorative border housing a painted artwork print' },
  { word: 'WALL', clue: 'Structural partition dividing rooms inside homes' },
  { word: 'FLOOR', clue: 'Flat walked-on surface carpeted with rug covers' },
  { word: 'RUG', clue: 'Soft textured floor textile fabric covering tiles' },
  { word: 'MAT', clue: 'Small woven floor layout for wiping muddy shoes' },
  { word: 'TILE', clue: 'Square fired clay piece paving bathroom floors' },
  { word: 'PIPE', clue: 'Hollow plumbing tube carrying clean water supply' },
  { word: 'SINK', clue: 'Basin bowl faucet used for washing grimy hands' },
  { word: 'TUB', clue: 'Deep bathroom basin ideal for relaxing warm baths' },
  { word: 'BATH', clue: 'Soaking cleanliness routine utilizing soap bubbles' },
  { word: 'POWDER', clue: 'Fine ground cosmetic dusting dusting skin dry' },
  { word: 'SCENT', clue: 'Pleasant aroma drifting off floral bloom fields' },
  { word: 'ODOR', clue: 'Distinct scent profile picked up by nose pathways' },
  { word: 'NOSE', clue: 'Facial sensing organ picking up beautiful baking fumes' },
  { word: 'EAR', clue: 'Side head sensory organ receiving lovely song notes' },
  { word: 'EYE', clue: 'Visual sensory organ observing vibrant art painting colors' },
  { word: 'FACE', clue: 'Front head area displaying smiles or thoughtful expressions' },
  { word: 'CHEEK', clue: 'Rounded face area showing blushes when joyful' },
  { word: 'CHIN', clue: 'Bony facial point located directly below the mouth' },
  { word: 'LIP', clue: 'Fleshy mouth margin boundary framing a bright smile' },
  { word: 'MOUTH', clue: 'Facial opening used to taste meals or speak words' },
  { word: 'TONGUE', clue: 'Muscular mouth organ sensing sweet flavor compounds' },
  { word: 'TOOTH', clue: 'Hard white enamel structure used to chew apples' },
  { word: 'JAW', clue: 'Hinged skeletal framework holding teeth securely' },
  { word: 'NECK', clue: 'Cylinder body region connecting shoulders to head' },
  { word: 'THROAT', clue: 'Internal airway channel swallowing hot lemon teas' },
  { word: 'VOICE', clue: 'Acoustic sound spoken or sung by a human person' },
  { word: 'WORD', clue: 'Meaningful unit of language filled out into puzzles' },
  { word: 'TEXT', clue: 'Written alphabetic characters printed into story books' },
  { word: 'PAGE', clue: 'Single leaf paper sheet binding into magazines' },
  { word: 'NOTE', clue: 'Brief written reminder message pinned to refrigerators' },
  { word: 'LETTER', clue: 'Mail envelope message sent to distant relatives' },
  { word: 'STAMP', clue: 'Adhesive fee token affixed onto mailing envelopes' },
  { word: 'POST', clue: 'The organized domestic mail handling package delivery system' },
  { word: 'BOX', clue: 'Cardboard container holding shipment surprise items' },
  { word: 'BAG', clue: 'Flexible handheld sack carrying grocery market buys' },
  { word: 'SACK', clue: 'Large coarse cloth bag packing potatoes safely' },
  { word: 'PACK', clue: 'To bundle belongings together before travel trips' },
  { word: 'CASE', clue: 'Hard shell luggage box housing fine instruments' },
  { word: 'KEY', clue: 'Metal notched device turning locks to open doors' },
  { word: 'LOCK', clue: 'Security mechanism opened exclusively by direct keys' },
  { word: 'RING', clue: 'Circular band jewelry piece worn around fingers' },
  { word: 'BAND', clue: 'Strap of material or group playing musical instruments' },
  { word: 'BELL', clue: 'Hollow metallic instrument ringing clear alert tones' },
  { word: 'CHIME', clue: 'Melodic soft bell sound ringing in porch winds' },
  { word: 'HORN', clue: 'Audible warning device blown on cars or trucks' },
  { word: 'DRUM', clue: 'Percussion instrument struck rhythmically with sticks' },
  { word: 'FLUTE', clue: 'Slender woodwind pipe blowing high silver tones' },
  { word: 'HARP', clue: 'Large multi-stringed frame instrument plucked gently' },
  { word: 'LUTE', clue: 'Pear-shaped vintage stringed instrument preceding guitars' },
  { word: 'SONG', clue: 'An arrangement of musical vocals that pleases ears' },
  { word: 'TUNE', clue: 'Catchy melodic sequence humming inside memory lines' },
  { word: 'NOTE', clue: 'Individual tone pitch symbol drawn onto sheet scores' },
  { word: 'BEAT', clue: 'Steady underlying rhythm guiding marching tempos' },
  { word: 'PACE', clue: 'The regulated speed you maintain while walking paths' },
  { word: 'SLOW', clue: 'Deliberate relaxed speed allowing complete safety' },
  { word: 'FAST', clue: 'Rapid motion speed opposite of slow tempos' },
  { word: 'QUICK', clue: 'Swift prompt reaction taking minimal time frames' },
  { word: 'RAPID', clue: 'Fast paced movement velocity like rushing rivers' },
  { word: 'RUSH', clue: 'To move in an unnecessary hurry, skip safety steps' },
  { word: 'WAIT', clue: 'Pausing patiently in place until conditions improve' },
  { word: 'STOP', clue: 'Complete cessation of movement or vehicle travel' },
  { word: 'GO', clue: 'Proceeding forward along planned trajectory lines' },
  { word: 'TURN', clue: 'Changing direction headings left or right side' },
  { word: 'MOVE', clue: 'Altering position coordinates, keeping joints active' },
  { word: 'STAY', clue: 'Remaining anchored firmly in safe home locations' },
  { word: 'LIVE', clue: 'Experiencing vibrant days, breathing wholesome air' },
  { word: 'GROW', clue: 'Expanding capacities, getting taller like tree stems' },
  { word: 'RISE', clue: 'Ascending upwards like dawn sun positions climb' },
  { word: 'FALL', clue: 'Descending downward gravity pull like raindrops drop' },
  { word: 'DROP', clue: 'Single round moisture globule falling off leaves' },
  { word: 'POUR', clue: 'Heavy rainy downpour stream refreshing farm soil' },
  { word: 'FLOW', clue: 'Smooth uninterrupted fluid travel typical of rivers' },
  { word: 'GLIDE', clue: 'Effortless movement flow like swans over lakes' },
  { word: 'SOAR', clue: 'Flying exceptionally high up inside mountain winds' },
  { word: 'FLY', clue: 'Aloft travel mechanism achieved by bird wings' },
  { word: 'WING', clue: 'Feathered limb essential for bird flight pathways' },
  { word: 'FEATHER', clue: 'Ultra light downy plumage covering nesting birds' },
  { word: 'DOWN', clue: 'Super soft insulation feathers padding premium quilts' },
  { word: 'FUR', clue: 'Thick warm hair coat covering pet cats or puppies' },
  { word: 'HAIR', clue: 'Strand fibers growing on heads requiring combing brushes' },
  { word: 'BRUSH', clue: 'Grooming bristle handle smoothing out hair tangles' },
  { word: 'SOAP', clue: 'Suds cleaner washing away kitchen oil residues' },
  { word: 'SUDS', clue: 'White bubbly foam created by mixing soap with water' },
  { word: 'BUBBLE', clue: 'Thin floating air sphere children blow from wands' },
  { word: 'FOAM', clue: 'Frothy layer capping sea waves or latte drinks' },
  { word: 'FROST', clue: 'Delicate ice crystal patterns freezing winter windowpanes' },
  { word: 'COLD', clue: 'Chilly winter air conditions requiring coat protection' },
  { word: 'COOL', clue: 'Pleasantly balanced crisp temperature level' },
  { word: 'WARM', clue: 'Cozy snug temperature level like freshly baked breads' },
  { word: 'HOT', clue: 'High heat intensity rating of wood fire stovetops' },
  { word: 'BAKE', clue: 'Cooking dough items inside dry oven heat boxes' },
  { word: 'BOIL', clue: 'Heating water until high vapor bubble surface breaks' },
  { word: 'COOK', clue: 'Preparing edible recipe ingredients into warm meals' },
  { word: 'EAT', clue: 'Consuming meals to maintain full physical health power' },
  { word: 'DINE', clue: 'Sitting down to enjoy evening dinner with friends' },
  { word: 'FEED', clue: 'Providing nutrition or tossing seeds to pond ducks' },
  { word: 'FOOD', clue: 'Nourishment items eaten to sustain body energy' },
  { word: 'SEED', clue: 'Kernel element dropped in dirt rows to grow sprouts' },
  { word: 'SPROUT', clue: 'Tiny new green shoot popping out of garden soil' },
  { word: 'BLOOM', clue: 'Opening petals fully to present colorful flower faces' },
  { word: 'BUD', clue: 'Small tightly closed precursor node of flower blooms' },
  { word: 'ROSE', clue: 'Vibrant thorny flower species packed with sweet scent' },
  { word: 'PINK', clue: 'Gentle pastel red hue color of garden carnations' },
  { word: 'RED', clue: 'Bold primary color of ripe apples and sweet strawberries' },
  { word: 'BLUE', clue: 'Calming color spectrum of clear sunny afternoon skies' },
  { word: 'GREEN', clue: 'Natural healthy color of lawn grass and tree leaves' },
  { word: 'WHITE', clue: 'Clean color of winter snow flakes and puffy clouds' },
  { word: 'BLACK', clue: 'Darkest tone shade seen when light sources vanish' },
  { word: 'GRAY', clue: 'Muted intermediate tone color of overcast storm skies' },
  { word: 'BROWN', clue: 'Earth tone color of rich tree bark and planting soil' },
  { word: 'GOLD', clue: 'Shiny bright yellow shade mimicking precious minerals' },
  { word: 'STAR', clue: 'Gleaming point light helping navigate ocean ships' },
  { word: 'BEAM', clue: 'Ray of sunny illumination breaking through window blinds' },
  { word: 'RAY', clue: 'Single narrow line stream of flashlight illumination' },
  { word: 'LAMP', clue: 'Electrical glow fixture seated onto bedside tables' },
  { word: 'GLOW', clue: 'Soft smooth light emissions given off by night lamps' },
  { word: 'SHINE', clue: 'To cast bright intense illumination across spaces' },
  { word: 'BRIGHT', clue: 'Vivid highly lit condition like clear midday suns' },
  { word: 'DARK', clue: 'Night absence of light signaling sleep schedules' },
  { word: 'SHADOW', clue: 'Dark outline shape mapped where object blocks light' },
  { word: 'SHADE', clue: 'Cool shelter spot underneath wide oak tree branches' },
  { word: 'COOL', clue: 'Refreshing air sensation experienced near park fountains' },
  { word: 'POOL', clue: 'Clear built water structure ideal for physical swim therapies' },
  { word: 'SWIM', clue: 'Arm stroke propulsion method through crystal pool lanes' },
  { word: 'DIVE', clue: 'Plunging headfirst into deep verified swimming pool water' },
  { word: 'DEEP', clue: 'Extending far downward opposite of shallow wade spots' },
  { word: 'HIGH', clue: 'Extending far upward like mountain peak zones' },
  { word: 'TALL', clue: 'Elevated height status of giant cedar forest trees' },
  { word: 'LOW', clue: 'Positioned close down near ground root networks' },
  { word: 'FLAT', clue: 'Level horizontal surface lacking hill slope angles' },
  { word: 'LEVEL', clue: 'Even balanced plane checked using bubble gauge tools' },
  { word: 'TRUE', clue: 'Accurate correct assessment matching objective real facts' },
  { word: 'GOOD', clue: 'Positive desirable wholesome quality trait value' },
  { word: 'FINE', clue: 'Excellent condition status or thin fiber sizing' },
  { word: 'NICE', clue: 'Pleasant friendly demeanor appreciated by care staff' },
  { word: 'KIND', clue: 'Warm helper mindset focused on patient comforts' },
  { word: 'HELP', clue: 'Providing immediate backup to speed up recovery tasks' },
  { word: 'CURE', clue: 'Medical resolution banishing health ailments completely' },
  { word: 'HEAL', clue: 'Mending fractured bone structures or skin surfaces over time' },
  { word: 'SAFE', clue: 'Secure protected status free from hazard slip risks' },
  { word: 'SURE', clue: 'Confident certain state of mind regarding puzzle paths' },
  { word: 'WISE', clue: 'Possessing vast deep knowledge accrued over long lives' },
  { word: 'MIND', clue: 'The mental computing focus creating complex puzzle answers' },
  { word: 'SOUL', clue: 'The profound emotional center of human personality' },
  { word: 'HEART', clue: 'The rhythmic pulse engine sustaining human lives daily' },
  { word: 'BEAT', clue: 'Steady clock tick sound of healthy heart actions' },
  { word: 'LIFE', clue: 'Vibrant awake existence experienced every precious day' },
  { word: 'DAYS', clue: 'Sunlit periods tracking across weekly wall calendars' },
  { word: 'WEEK', clue: 'Seven day unit tracking standard therapy goal segments' },
  { word: 'YEAR', clue: 'Twelve month block tracking long term growth milestones' },
  { word: 'TIME', clue: 'Continuous progression measured by ticking room clocks' },
  { word: 'HOUR', clue: 'Sixty minute block tracking standard puzzle sessions' },
  { word: 'DATE', clue: 'Calendar day enumeration matching specific month blocks' },
  { word: 'PLAN', clue: 'Structured blueprint outline guiding health recovery pathways' },
  { word: 'GOAL', clue: 'Target achievement status standard we work hard to attain' },
  { word: 'WORK', clue: 'Focused effort expended to accomplish chosen tasks' },
  { word: 'PLAY', clue: 'Relaxed puzzle pastimes keeping cognitive tracks sharp' },
  { word: 'GAME', clue: 'Entertaining mental challenge matrix matching clues with words' },
  { word: 'WORD', clue: 'The solution array filled inside crossword horizontal rows' },
  { word: 'CLUE', clue: 'The definition text hint guiding your word solutions' },
  { word: 'HINT', clue: 'A helpful small suggestion pushing minds to right answers' },
  { word: 'IDEA', clue: 'Sudden thought spark resolving difficult clue prompts' },
  { word: 'THINK', clue: 'Exercising cognitive brain networks to solve grids' },
  { word: 'KNOW', clue: 'Possessing clear accurate info stored safely in memory' },
  { word: 'LEARN', clue: 'Acquiring helpful new knowledge assets day by day' },
  { word: 'READ', clue: 'Scanning text print eye tracks inside favorite books' },
  { word: 'BOOK', clue: 'Bound literature asset providing hours of calm reading' },
  { word: 'PAGE', clue: 'Paper sheet module containing chapter story lines' },
  { word: 'POEM', clue: 'Beautiful rhyming stanza text structured by artistic writers' },
  { word: 'TALE', clue: 'Exciting narrative story tracking grand historical travels' },
  { word: 'FACT', clue: 'Verifiable solid truth point backed by clear logic proofs' },
  { word: 'REAL', clue: 'Genuine authentic items existing in physical spaces' },
  { word: 'PURE', clue: 'Unadulterated clean state like pristine winter mountain snows' },
  { word: 'CLEAN', clue: 'Spotless sterile hygiene status of recovery room tools' },
  { word: 'WASH', clue: 'Cleansing hand routine under warm running sink streams' },
  { word: 'SOAP', clue: 'Fragrant lather agent removing dirt germs effectively' },
  { word: 'FOAM', clue: 'Frothy light collection generated by liquid hand soaps' },
  { word: 'SINK', clue: 'Porcelain plumbing bowl equipped with easy twist faucets' },
  { word: 'HOME', clue: 'Cozy personal sanctuary where loved ones reside safely' }
];

const CW_SIZE = 13;

type CWCell = { letter: string; black: boolean; number?: number };
type PlacedWord = { word: string; clue: string; r: number; c: number; dir: 'across' | 'down'; number: number };

// DYNAMIC ADAPTIVE CROSSWORD COMPILER ENGINE
function buildCW(clues: typeof CW_CLUES): { grid: CWCell[][]; placed: PlacedWord[] } {
  // Step A: Shuffle the extensive list to secure a unique random seed set every time
  const shuffledClues = [...clues].sort(() => Math.random() - 0.5);
  
  const grid: CWCell[][] = Array.from({ length: CW_SIZE }, () =>
    Array.from({ length: CW_SIZE }, () => ({ letter: '', black: true }))
  );
  const placed: PlacedWord[] = [];
  let num = 1;

  const canPlace = (word: string, r: number, c: number, dir: 'across' | 'down') => {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    if (r + dr * (word.length - 1) >= CW_SIZE || c + dc * (word.length - 1) >= CW_SIZE) return false;
    
    // Bounds validation checks
    const pr = r - dr, pc = c - dc; 
    if (pr >= 0 && pc >= 0 && !grid[pr][pc].black) return false;
    
    const er = r + dr * word.length, ec = c + dc * word.length; 
    if (er < CW_SIZE && ec < CW_SIZE && !grid[er][ec].black) return false;

    let hasIntersection = placed.length === 0;

    for (let i = 0; i < word.length; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      const cell = grid[nr][nc];

      if (!cell.black) {
        if (cell.letter !== word[i]) return false;
        hasIntersection = true; // Confirmed valid overlapping connection
      } else {
        // Enforce parallel separation parameters
        const lr = nr + dc, lc = nc + dr;
        const rr = nr - dc, rc = nc - dr;
        if ((lr < CW_SIZE && lr >= 0 && lc < CW_SIZE && lc >= 0 && !grid[lr][lc].black) ||
            (rr >= 0 && rc >= 0 && rr < CW_SIZE && rc < CW_SIZE && !grid[rr][rc].black)) {
          return false;
        }
      }
    }
    return hasIntersection;
  };

  const place = (word: string, clue: string, r: number, c: number, dir: 'across' | 'down') => {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      grid[nr][nc] = { ...grid[nr][nc], letter: word[i], black: false };
    }
    placed.push({ word, clue, r, c, dir, number: num++ });
  };

  // Plant the initial primary seed word right across the grid center point
  const first = shuffledClues[0];
  place(first.word, first.clue, Math.floor(CW_SIZE / 2), Math.floor((CW_SIZE - first.word.length) / 2), 'across');

  // Step B: Loop through available entries attempting to build branching intersections
  // We limit loop count to keep generation times rapid on lightweight consumer mobile devices
  for (let wi = 1; wi < shuffledClues.length && placed.length < 24; wi++) {
    const { word, clue } = shuffledClues[wi];
    if (word.length > CW_SIZE) continue;
    let done = false;

    for (const pw of [...placed].reverse()) {
      for (let li = 0; li < word.length && !done; li++) {
        for (let pi = 0; pi < pw.word.length && !done; pi++) {
          if (word[li] !== pw.word[pi]) continue;

          const tdir: 'across' | 'down' = pw.dir === 'across' ? 'down' : 'across';
          const dr = tdir === 'down' ? 1 : 0, dc = tdir === 'across' ? 1 : 0;
          const r = pw.r + (pw.dir === 'down' ? pi : 0) - dr * li;
          const c = pw.c + (pw.dir === 'across' ? pi : 0) - dc * li;

          if (r < 0 || c < 0) continue;
          if (canPlace(word, r, c, tdir)) {
            place(word, clue, r, c, tdir);
            done = true;
          }
        }
      }
    }
  }

  // Inject computed index identification numbers into appropriate tile coordinates
  for (const pw of placed) {
    if (!grid[pw.r][pw.c].number) {
      grid[pw.r][pw.c].number = pw.number;
    }
  }

  return { grid, placed };
}

// FULL SCREEN INTERACTIVE SMOOTH INK-WASH WATERCOLOR BLOOM CELEBRATION
function SmoothInkVictoryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Ink drops feature wide, expansive blooming circles with low soft opacity
    const blooms: any[] = [];
    const colorPalettes = [
      'rgba(16, 185, 129, ',  // Emerald calm
      'rgba(59, 130, 246, ',  // Sky ocean blue
      'rgba(245, 158, 11, ',  // Warm amber gold
      'rgba(139, 92, 246, ',  // Peaceful violet
      'rgba(236, 72, 153, '   // Soft health pink
    ];

    const spawnInkDrop = () => {
      blooms.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0,
        maxRadius: Math.random() * 120 + 80,
        speed: Math.random() * 1.5 + 0.8,
        opacity: 0.35,
        colorBase: colorPalettes[Math.floor(Math.random() * colorPalettes.length)]
      });
    };

    // Pre-populate initial blooms
    for (let i = 0; i < 6; i++) spawnInkDrop();

    let ticker = 0;
    const draw = () => {
      // Create a persistent bleed effect instead of wiping entirely clear every frame
      ctx.fillStyle = 'rgba(15, 23, 42, 0.04)';
      ctx.fillRect(0, 0, width, height);

      ticker++;
      if (ticker % 35 === 0 && blooms.length < 25) {
        spawnInkDrop();
      }

      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i];
        b.radius += b.speed;
        
        // Dissolve opacity smoothly as the circle spreads outwards
        const lifeRatio = b.radius / b.maxRadius;
        b.opacity = 0.35 * (1 - lifeRatio);

        if (b.radius >= b.maxRadius || b.opacity <= 0) {
          blooms.splice(i, 1);
          // Auto-regenerate drop to sustain the motion flow seamlessly
          spawnInkDrop();
          continue;
        }

        ctx.save();
        ctx.beginPath();
        // Create radial gradients to mimic physical fluid watercolor paper bleeding
        const gradient = ctx.createRadialGradient(b.x, b.y, b.radius * 0.2, b.x, b.y, b.radius);
        gradient.addColorStop(0, b.colorBase + b.opacity + ')');
        gradient.addColorStop(0.5, b.colorBase + (b.opacity * 0.4) + ')');
        gradient.addColorStop(1, b.colorBase + '0)');
        
        ctx.fillStyle = gradient;
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

export default function CrosswordGame({ onBack }: { onBack: () => void }) {
  // Key state elements tracking computed crossword matrix parameters
  const [board, setBoard] = useState(() => buildCW(CW_CLUES));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<{ r: number; c: number; dir: 'across' | 'down' } | null>(null);
  const [checked, setChecked] = useState(false);
  const [won, setWon] = useState(false);
  
  const inputRefs = useRef<Record<string, HTMLInputElement>>({});

  const key = (r: number, c: number) => `${r},${c}`;

  // Remakes a fresh board configuration out of the dictionary pool array
  const handleRegenerateGrid = () => {
    setBoard(buildCW(CW_CLUES));
    setAnswers({});
    setChecked(false);
    setWon(false);
    setFocus(null);
  };

  const getWordAt = useCallback((r: number, c: number, dir: 'across' | 'down') => {
    return board.placed.find(pw => 
      pw.dir === dir && 
      pw.r <= (dir === 'down' ? r : pw.r) && 
      pw.c <= (dir === 'across' ? c : pw.c) &&
      (dir === 'down' ? pw.r + pw.word.length - 1 >= r : pw.c + pw.word.length - 1 >= c) &&
      (dir === 'across' ? pw.r === r : pw.c === c)
    );
  }, [board.placed]);

  const handleInput = (r: number, c: number, val: string) => {
    const ch = val.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    const newAns = { ...answers, [key(r, c)]: ch };
    setAnswers(newAns);

    // Auto-advance focus parameter to next open cell in current directory
    if (ch && focus) {
      const [dr, dc] = focus.dir === 'across' ? [0, 1] : [1, 0];
      const nr = r + dr, nc = c + dc;
      if (nr < CW_SIZE && nc < CW_SIZE && !board.grid[nr][nc].black) {
        inputRefs.current[key(nr, nc)]?.focus();
      }
    }

    // Comprehensive real-time accuracy scanning engine
    const allCorrect = board.placed.every(pw => {
      const dr = pw.dir === 'down' ? 1 : 0;
      const dc = pw.dir === 'across' ? 1 : 0;
      return pw.word.split('').every((letter, i) => newAns[key(pw.r + dr * i, pw.c + dc * i)] === letter);
    });

    if (allCorrect) setWon(true);
  };

  const handleKeyDown = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !answers[key(r, c)] && focus) {
      // Reverse shift cell cursor focus when backspacing empty fields
      const [dr, dc] = focus.dir === 'across' ? [0, 1] : [1, 0];
      const pr = r - dr, pc = c - dc;
      if (pr >= 0 && pc >= 0 && !board.grid[pr][pc].black) {
        inputRefs.current[key(pr, pc)]?.focus();
      }
    }
  };

  const checkAnswers = () => setChecked(true);

  const getCellStatus = (r: number, c: number) => {
    if (!checked) return 'neutral';
    const fill = answers[key(r, c)];
    if (!fill) return 'empty';
    return fill === board.grid[r][c].letter ? 'correct' : 'wrong';
  };

  const acrossClues = [...board.placed].filter(p => p.dir === 'across').sort((a, b) => a.number - b.number);
  const downClues = [...board.placed].filter(p => p.dir === 'down').sort((a, b) => a.number - b.number);

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {won && <SmoothInkVictoryCanvas />}

        {/* Unified Premium Navigation Banner Block */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft color="#94a3b8" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>Mindfulness Crossword</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Soothing cognitive therapy workouts</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={checkAnswers} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '14px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }}
            >
              <CheckCircle2 size={16} />
              <span>Check Answers</span>
            </button>

            <button 
              onClick={handleRegenerateGrid}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', padding: '10px 14px', borderRadius: '14px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
            >
              <Shuffle size={15} color="#3b82f6" />
              <span className="hidden sm:inline">New Grid</span>
            </button>

            <button 
              onClick={() => { setAnswers({}); setChecked(false); setWon(false); }}
              style={{ padding: '10px', background: '#ea580c', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <RotateCcw color="white" size={16} />
            </button>
          </div>
        </div>

        {/* Prompt Information Alert Card Panel */}
        {checked && !won && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '12px 16px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <AlertCircle color="#ef4444" size={18} />
            <span style={{ color: '#fca5a5', fontSize: '13px', fontWeight: '500' }}>Review flagged entries: Incorrect placements are highlighted in crimson tiles.</span>
          </div>
        )}

        {/* Master Flex Matrix Dividing Interactive Elements */}
        <div style={{ display: 'flex', flexDirection: 'column', lgDirection: 'row', gap: '24px', alignItems: 'flex-start' }} className="flex-col lg:flex-row">
          
          {/* Main Grid Card Board System Area Container */}
          <div style={{ width: '100%', flex: '1.2', display: 'flex', justifyContent: 'center', background: '#1e293b', padding: '12px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>
            <div style={{ display: 'inline-block', background: '#0f172a', padding: '6px', borderRadius: '16px', width: '100%', maxWidth: '520px' }}>
              {board.grid.map((row, r) => (
                <div key={r} style={{ display: 'flex', width: '100%' }}>
                  {row.map((cell, c) => {
                    const status = cell.black ? 'black' : getCellStatus(r, c);
                    const isFocused = focus?.r === r && focus?.c === c;
                    const activeWord = focus ? getWordAt(focus.r, focus.c, focus.dir) : null;
                    
                    const inHighlightedWord = !cell.black && activeWord && (() => {
                      const dr = activeWord.dir === 'down' ? 1 : 0;
                      const dc = activeWord.dir === 'across' ? 1 : 0;
                      for (let i = 0; i < activeWord.word.length; i++) {
                        if (activeWord.r + dr * i === r && activeWord.c + dc * i === c) return true;
                      }
                      return false;
                    })();

                    // SVG Organic Textured Block for empty non-word puzzle fields
                    if (cell.black) {
                      return (
                        <div 
                          key={c} 
                          style={{ 
                            flex: 1,
                            aspectRatio: '1',
                            margin: '1px',
                            background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.4
                          }}
                        >
                          <svg width="45%" height="45%" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1.5">
                            <path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19" />
                          </svg>
                        </div>
                      );
                    }

                    // Compute adaptive background colors based on cell status parameters
                    let tileBg = 'rgba(255,255,255,0.03)';
                    let tileBorder = 'rgba(255,255,255,0.08)';
                    let inputColor = 'white';

                    if (inHighlightedWord) { tileBg = 'rgba(59,130,246,0.08)'; tileBorder = '#3b82f6'; }
                    if (isFocused) { tileBg = 'rgba(245,158,11,0.12)'; tileBorder = '#f59e0b'; }
                    if (status === 'correct') { tileBg = 'rgba(16,185,129,0.15)'; tileBorder = '#10b981'; inputColor = '#34d399'; }
                    if (status === 'wrong') { tileBg = 'rgba(239,68,68,0.15)'; tileBorder = '#ef4444'; inputColor = '#f87171'; }

                    return (
                      <div 
                        key={c}
                        style={{
                          flex: 1,
                          aspectRatio: '1',
                          margin: '1px',
                          position: 'relative',
                          background: tileBg,
                          border: `1.5px solid ${tileBorder}`,
                          borderRadius: '6px',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box'
                        }}
                      >
                        {cell.number && (
                          <span style={{ position: 'absolute', top: '2px', left: '3px', fontSize: '9px', fontWeight: '900', color: '#f59e0b', pointerEvents: 'none', lineHeight: 1 }}>
                            {cell.number}
                          </span>
                        )}
                        <input
                          ref={el => { if (el) inputRefs.current[key(r, c)] = el; }}
                          value={answers[key(r, c)] || ''}
                          onChange={e => handleInput(r, c, e.target.value)}
                          onKeyDown={e => handleKeyDown(r, c, e)}
                          onFocus={() => setFocus(f => f?.r === r && f?.c === c && f?.dir === 'across' ? { r, c, dir: 'down' } : { r, c, dir: 'across' })}
                          maxLength={1}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            textAlign: 'center',
                            fontWeight: '800',
                            fontSize: 'clamp(14px, 3.5vw, 18px)',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: inputColor,
                            textTransform: 'uppercase',
                            padding: 0,
                            paddingTop: '6px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Dual Directory Clue Panel Modules */}
          <div style={{ width: '100%', flex: '1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[{ label: 'Across Clues', list: acrossClues, symbol: '➔' }, { label: 'Down Clues', list: downClues, symbol: '↓' }].map(({ label, list, symbol }) => (
              <div key={label} style={{ background: '#1e293b', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={15} color="#f59e0b" />
                  <span style={{ fontSize: '14px', fontWeight: '800', color: 'white', letterSpacing: '0.2px' }}>{label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '99px', fontWeight: '700' }}>{list.length} items</span>
                </div>

                <div style={{ padding: '8px', maxHeight: '230px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {list.map(pw => {
                    const dr = pw.dir === 'down' ? 1 : 0;
                    const dc = pw.dir === 'across' ? 1 : 0;
                    
                    // Verify if word sequence contains entirely accurate answers
                    const isCompleted = pw.word.split('').every((letter, i) => answers[key(pw.r + dr * i, pw.c + dc * i)] === letter);
                    const isActive = focus?.r === pw.r && focus?.c === pw.c && focus?.dir === pw.dir;

                    return (
                      <button
                        key={pw.number}
                        onClick={() => { inputRefs.current[key(pw.r, pw.c)]?.focus(); setFocus({ r: pw.r, c: pw.c, dir: pw.dir }); }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          fontSize: '13.5px',
                          fontWeight: '600',
                          border: '1px solid transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease',
                          background: isActive ? 'rgba(245,158,11,0.08)' : isCompleted ? 'rgba(16,185,129,0.04)' : 'transparent',
                          borderColor: isActive ? '#f59e0b' : isCompleted ? 'rgba(16,185,129,0.15)' : 'transparent',
                          color: isCompleted ? '#a7f3d0' : isActive ? 'white' : '#94a3b8'
                        }}
                      >
                        <span style={{ color: '#f59e0b', fontWeight: '900', marginRight: '2px', width: '22px', shrink: '0' }}>{pw.number}.</span>
                        <span style={{ flex: 1, lineHeight: 1.3, textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.6 : 1 }}>{pw.clue}</span>
                        {isCompleted && <span style={{ color: '#10b981', fontWeight: '800', fontSize: '12px', marginLeft: 'auto' }}>✓</span>}
                        {isActive && <span style={{ color: '#f59e0b', fontSize: '10px', marginLeft: 'auto' }}>{symbol}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Premium Full-Screen Ink Bleed Victory Modal Overlay Overlay */}
        <AnimatePresence>
          {won && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}
            >
              <motion.div 
                initial={{ scale: 0.85, y: 30 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.85, y: 30 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '36px 24px', textAlign: 'center', maxWidth: '420px', width: '100%', margin: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}
              >
                <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#10b981' }}>
                  <Sparkles size={40} />
                </div>
                
                <h3 style={{ fontSize: '26px', fontWeight: '900', color: 'white', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Grid Fully Solved!</h3>
                <p style={{ color: '#94a3b8', fontSize: '14.5px', margin: '0 0 28px 0', lineHeight: 1.5 }}>
                  Excellent work. Your cognitive pathways are perfectly connected, and every theme word matches up beautifully.
                </p>
                
                <button 
                  onClick={handleRegenerateGrid} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}
                >
                  Generate Next Puzzle
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}