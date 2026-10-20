/* Vocab Master — short reading texts for every Cambridge Primary Path unit (pure).
 * Three original texts per unit, written for the book's usual class and built on the unit's words:
 * a fact text (like the unit's non-fiction reading), a story (named characters, a clear order of events)
 * and an everyday text (an email, a notice, a diary, a dialogue…). Test Maker's reading parts can use one
 * as the passage: the text is printed exactly as written here and the AI only writes the questions.
 * Primary Path 1 ≈ A Senior (50–90 words), 2 ≈ B Senior (90–120), 3 ≈ C Senior (110–150). */
import { unitWords } from "./unit-context.js";

export const TEXT_KINDS = {
  fact: { label: "Fact text", icon: "🔎" },
  story: { label: "Story", icon: "📚" },
  everyday: { label: "Everyday text", icon: "✉️" },
};

/** [bookId, unit, kind, genre, title, text] — paragraphs and dialogue lines are split by \n. */
const TEXTS = [
  /* ── Primary Path 1 ─────────────────────────────────────────────── */
  ["CPP1", 1, "fact", "Fact text", "Families Are Different",
    "There are many kinds of families. Some families are big and some are small. Ana lives in a city in Brazil. She lives in an apartment with her mother, her father and her baby brother. Kenji lives in Japan. His grandmother and grandfather live in his house, too. Amaru's family are nomads. They travel from place to place and live in a big tent. All families are different, but they have something in common. They help and love each other."],
  ["CPP1", 1, "story", "Story", "Grandma's Story",
    "It is bedtime. Lily puts on her pajamas. Her brother Max is in bed, too. Grandma comes into the bedroom.\n\"Can you tell us a story, Grandma?\" asks Lily.\n\"Yes, I can,\" says Grandma. She tells a story about a princess and a little cottage. Max is sleepy. He closes his eyes. Lily listens to the end of the story.\n\"Good night, Grandma,\" she says. \"I love your stories.\"\nGrandma smiles. \"Good night, my dears.\""],
  ["CPP1", 1, "everyday", "Presentation", "My Family Tree",
    "Hello! My name is Sam. This is my family tree. My father is Tom and my mother is Kate. I have got one sister. Her name is Emma and she is ten. My grandparents live on a farm. Grandpa has got two cows and a rooster! My aunt and uncle live in the city with my cousin Ben. We meet at Grandma's house on Sundays. We eat dinner and play games in the backyard."],

  ["CPP1", 2, "fact", "Fact text", "Schools Around the World",
    "Students go to school all over the world, but schools are not the same. In Japan, students clean their classroom. In many countries, students wear a uniform. In some schools, students eat lunch in the cafeteria. In other schools, they bring a snack from home. Some schools have a gym, a music room and a computer lab. Some schools are very small, with one classroom and one teacher. At every school, students read, write, learn and have fun with their classmates."],
  ["CPP1", 2, "story", "Story", "A New Friend",
    "It is Ravi's first day at a new school. He feels sad. He doesn't know the other students. The teacher, Ms. Green, says, \"Welcome, Ravi! Sit here, next to Tom.\" Tom smiles. \"Nice to meet you,\" he says.\nAt lunch break, Tom and Ravi eat sandwiches in the playground. Then a girl called Mia comes over. \"Do you want to play hide-and-seek?\" she asks. Ravi plays with Tom and Mia. Now he isn't sad. He is happy at his new school."],
  ["CPP1", 2, "everyday", "Notice", "Our School Festival",
    "SCHOOL FESTIVAL! Come to our school festival next week!\nWhen: Friday, at 10 o'clock.\nWhere: in the auditorium and the playground.\nThere are games, music and a colorful parade. You can wear a mask! Make your mask in the art room with Mr. Brown. Bring a cardboard box, glue and colored pencils. You can buy a cake or a healthy snack. See you there!"],

  ["CPP1", 3, "fact", "Fact text", "Life in a Pond",
    "A pond is a home for many living things. Water lilies grow on the water. They have got big, flat leaves. Fish swim under the water. Frogs sit on the rocks next to the pond. A baby frog is a tadpole. It has got a long tail and it lives in the water. Dragonflies fly over the pond. They are insects. They have got six legs and four wings. Plants and animals need fresh water, sunlight and food. A pond is a busy place!"],
  ["CPP1", 3, "story", "Story", "Jack and the Beanstalk",
    "Jack and his mother are poor. One day, Jack sells their cow for some beans. His mother is angry. She throws the beans out of the window. In the morning, there is a big beanstalk in the garden! Jack climbs up and up. At the top, there is a castle. A giant lives in the castle. He has got a goose. The goose lays golden eggs! Jack takes the goose and climbs down quickly. Now Jack and his mother are rich."],
  ["CPP1", 3, "everyday", "Diary", "My Bean Plant",
    "Monday: Today I put a bean seed in a flowerpot with soil. I water it and put it in the sunlight.\nWednesday: I can't see my plant. I wait.\nFriday: Look! There is a small green stem.\nNext Monday: My plant has got two leaves now. It is ten centimeters tall!\nPlants need water, soil and light to grow. I look at my plant every day. I love my bean plant!"],

  ["CPP1", 4, "fact", "Fact text", "What Do Friends Do?",
    "Friends are people we like. We spend time together and we help each other. Friends play games, ride bikes and fly kites in the park. Some friends like the same things. Leo and Max both love soccer. Other friends are different. Zoe likes reading stories, but her friend Kim likes drawing pictures. That's OK! Good friends listen and take turns. They share their toys and say \"sorry\". Do you have a best friend? What do you do together?"],
  ["CPP1", 4, "story", "Story", "Chipmunk's Kite",
    "Chipmunk has got a new red kite. He wants to fly it, but the kite is big. \"Can you help me?\" he asks Duckling. \"Yes!\" says Duckling. They run in the park, but the kite falls down.\nThen Goat comes. \"I can help,\" she says. \"I'm tall and strong.\" Goat holds the kite and Chipmunk and Duckling run. Up, up goes the kite! The three friends laugh. \"Friends help each other,\" says Chipmunk."],
  ["CPP1", 4, "everyday", "Message", "A Play Date",
    "Hi Emma,\nCan you come to my house on Saturday for a play date? We can play in the backyard. I have got a new swing and a slide! We can ride bikes or make a fort in my bedroom. My mom can make pizza for lunch. Ask your mom and call me, please.\nSee you on Saturday!\nYour friend, Lucy"],

  ["CPP1", 5, "fact", "Fact text", "Toys, Old and New",
    "Children all over the world love toys and games. Some toys are old-fashioned, like yo-yos and wooden dolls. A yo-yo goes up and down on a string. Matryoshka dolls are traditional toys from Russia. There is a small doll inside a big doll, and another doll inside that one! Today, many children play video games. Others like board games, jigsaw puzzles or building blocks. Old toys or new toys? They are all fun!"],
  ["CPP1", 5, "story", "Story", "The Rainy Day",
    "It is Saturday and it is raining. Ben and his sister Kate can't play in the park. \"I'm bored,\" says Ben. Mom has an idea. \"Let's look in the closet!\" In the closet, there is a big box. Inside there are old toys: a teddy bear, a ball, a yo-yo and a board game.\nBen plays with the yo-yo. Kate and Mom play the board game. Then Dad bakes cookies. \"This is a fun day!\" says Kate. Ben smiles. \"I love rainy days now!\""],
  ["CPP1", 5, "everyday", "Notice", "Happy Toys Store",
    "Come to Happy Toys on Main Street!\nStuffed animals: $5\nJigsaw puzzles: $8\nAction figures: $6\nBuilding blocks: $12\nDollhouses: $30\nEvery Saturday at 11 o'clock, there is a guessing game for children. Can you guess how many candies are in the jar? Win a special gift! We are open every day from 9 a.m. to 6 p.m."],

  ["CPP1", 6, "fact", "Fact text", "Helping Our Community",
    "We can all help our community. Some children visit a retirement home. They chat with the residents and sing songs. Other children help at an animal shelter. They walk the dogs and brush the cats. Some families donate blankets and food. At school, students can recycle bottles and cans. They can clean up the park, too. Firefighters and doctors help people every day. How can you help in your community?"],
  ["CPP1", 6, "story", "Story", "Kitten in the Tree",
    "Lily has got a little kitten called Snowy. One day, Snowy climbs a tall tree. She can't get down! Lily calls her dad. Dad tries, but the tree is too tall. \"Let's call the firefighters,\" he says. The firefighters come with a big ladder. A firefighter called Sam climbs the ladder and gets the kitten. \"Here you are!\" he says. Lily hugs Snowy. \"Thank you!\" she says. Now Snowy is safe."],
  ["CPP1", 6, "everyday", "Chart", "My Chores",
    "Hi! I'm Nick. I help at home every day.\nOn Monday, I make my bed and set the table.\nOn Tuesday, I water the plants.\nOn Wednesday, I sweep the floor in the kitchen.\nOn Thursday, I help Mom with the laundry.\nOn Friday, I wash the dishes with my brother.\nOn the weekend, I tidy my room.\nMom says I'm a great helper! What chores do you do?"],

  ["CPP1", 7, "fact", "Fact text", "Amazing Animals",
    "Animals are amazing! Bats sleep upside down in caves in the day. At night they wake up and fly. Reindeer live in cold places with lots of snow. They have got thick fur to stay warm. They have got big antlers, too. Camels live in the desert. They can walk a long way with no water. Bees live in a hive. They make honey from nectar. We need animals. They give us food like milk, eggs and honey."],
  ["CPP1", 7, "story", "Story", "Ollie the Camel",
    "Ollie is a young camel. He lives in the desert with his family. Every day it is hot and sunny. One day, Ollie sees a reindeer in a picture. \"I want to live in the snow!\" he says. His mother laughs. \"Your feet are good for sand, Ollie, not snow. And you haven't got thick fur.\" Ollie thinks. \"You're right, Mom. I have got long legs and big feet. I can walk and walk!\" Now he is happy in the desert."],
  ["CPP1", 7, "everyday", "Dialogue", "At the Market",
    "Sara: Good morning! Can I have some tomatoes, please?\nSeller: Here you go. Anything else?\nSara: Yes, I need some grapes and a pear.\nSeller: Red grapes or green grapes?\nSara: Green, please. Have you got any honey?\nSeller: Yes, this honey is from my bees. It's very good!\nSara: Great. And a carton of juice, please.\nSeller: Here you go. That's seven dollars, please.\nSara: Thank you!"],

  ["CPP1", 8, "fact", "How-to", "Make an Astronaut Helmet",
    "You need: a big paper bag, aluminum foil, tape, two pipe cleaners and scissors.\nFirst, cut out a big square in the front of the bag. This is the window. Then, wrap the bag in aluminum foil. After that, tape the foil to the bag. Next, put the pipe cleaners on top. These are the antennae! Finally, put on your helmet. Now you are an astronaut! Where in space do you want to go?"],
  ["CPP1", 8, "story", "Story", "Maya's Dream",
    "Maya loves painting. One night, she has a dream. She paints a big orange tiger and it comes alive! The tiger is gentle and friendly. \"Do you want a ride?\" it asks. Maya sits on the tiger and they go to the circus. There are clowns and a silly donkey. Maya giggles. Then the tiger says, \"It's time to go home.\" Maya opens her eyes. She is in her bedroom. On her table, there is a painting of a tiger!"],
  ["CPP1", 8, "everyday", "Invitation", "Costume Party!",
    "You're invited to a costume party!\nCome as your favorite superhero, pilot, clown or astronaut.\nWhen: Saturday, at 4 p.m.\nWhere: Rosa's house, 12 Green Street.\nMake a costume from your imagination! You can make it with cardboard, paper or old clothes. There are games, music and a prize for the best costume. See you there!"],

  ["CPP1", 9, "fact", "Fact text", "Clothes for Every Season",
    "We wear different clothes for different weather. In spring, it is warm and the flowers are in bloom. We wear T-shirts and jeans. In summer, it is hot. We wear shorts and go to the seashore. In fall, it is windy and the leaves fall from the trees. We wear a jacket. In winter, it is cold and snowy. We wear a coat, a scarf and gloves. We also wear special clothes for special occasions, like a dress for a party."],
  ["CPP1", 9, "story", "Story", "The Big Storm",
    "Emma and her brother Leo are in the park. It is sunny, so they are wearing T-shirts and shorts. Suddenly, the sky is dark. \"Look, a storm!\" says Leo. There is thunder and lightning. Rain starts to drop on their heads. They run home quickly. Dad is at the door. \"You're all wet!\" he says. \"Take off your wet clothes and put on your pajamas.\" Emma and Leo sit by the window with hot cocoa. \"I love storms,\" says Emma, \"from inside!\""],
  ["CPP1", 9, "everyday", "Letter", "Camping Clothes",
    "Hi Grandma!\nWe go camping in the mountains next week. It is cold at night, so I need warm clothes. I have got my jacket, two sweaters, my scarf and my gloves. I have got jeans and tennis shoes for walking, too. Mom says I need a raincoat because it is rainy in the mountains. I can't wait! We can see the stars at night.\nLove, Mia"],

  /* ── Primary Path 2 ─────────────────────────────────────────────── */
  ["CPP2", 1, "fact", "Fact text", "Jobs in My Neighborhood",
    "My neighborhood is a busy place, and lots of people work here. Mrs. Lee is a baker. She gets up at five o'clock and bakes fresh bread at the bakery. Dr. Patel works at the hospital. He takes care of sick people. Our vet, Mr. Brown, helps sick animals. Next to the train station, there is a fire station. The firefighters are always ready to help. There is also a barbershop, a supermarket and a small museum. I like my neighborhood because the people are friendly and helpful."],
  ["CPP2", 1, "story", "Story", "Lost and Found",
    "Last Saturday, Jack went to the museum with his grandpa. They looked at old paintings and a big dinosaur. When they got home, Jack couldn't find his blue cap. \"Oh no! It was my favorite cap,\" he said.\nThe next day, they went back to the museum. A security guard was at the door. \"Excuse me, did you find a blue cap?\" asked Grandpa. \"Let me check the Lost and Found,\" said the guard. She came back with the cap! \"Thank you!\" said Jack with a big smile."],
  ["CPP2", 1, "everyday", "Email", "Directions to My House",
    "Hi Sofia,\nI'm happy you can come to my party on Sunday! Here are the directions. Take the train to Park Street Station. When you come out of the station, turn left. Walk past the bank and the candy store. Then turn right on Green Street. My building is between the movie theater and the hair salon. It is a tall white building with a red door. I live on the third floor, apartment 3B. Call me if you get lost!\nSee you soon,\nMaria"],

  ["CPP2", 2, "fact", "Fact text", "Birthdays Around the World",
    "People celebrate birthdays in different ways. In many countries, children have a cake with candles. They make a wish and blow out the candles. In Mexico, children often hit a piñata. It is full of candy! In China, people sometimes eat long noodles on their birthday. The long noodles mean a long life. In Brazil, friends pull the birthday child's ears, one pull for every year! Celebrations are important because families and friends come together and share happy moments."],
  ["CPP2", 2, "story", "Story", "The Missing Necklace",
    "It was Grandma's birthday and the family had a fancy party. Grandma wore her diamond necklace. After dinner, she looked in the mirror. \"My necklace is missing!\" she said. Everybody was worried.\nLucy, her granddaughter, wanted to be a detective. She looked closely around the house. She checked under the table and behind the sofa. Then she went into the garden. There, next to the roses, was the necklace! \"I took off my garden gloves here this afternoon,\" laughed Grandma. \"Thank you, Detective Lucy!\""],
  ["CPP2", 2, "everyday", "Invitation", "Alex's Birthday Party",
    "Dear Tom,\nPlease come to my birthday party!\nDate: Saturday, May 12th\nTime: 3 to 6 p.m.\nAddress: 25 Hill Road\nWe are going to play games, break a piñata and eat lots of cake. My mom is making cupcakes, too. There is a surprise: a magician! Please bring your swimsuit because there is a pool. Can you come? Please answer by Wednesday.\nFrom, Alex"],

  ["CPP2", 3, "fact", "Fact text", "Healthy Eating",
    "Food gives us energy to play, learn and grow. To be healthy, we need to eat different kinds of food. Fruit and vegetables, like carrots, broccoli and grapes, have lots of vitamins. Bread, rice and pasta give us energy. Fish, beans and chicken have protein. Protein helps our bodies grow strong. Milk, cheese and yogurt are dairy products. They have calcium for strong bones. Cookies, candy and ice cream taste good, but they have a lot of sugar. We should only eat them sometimes."],
  ["CPP2", 3, "story", "Story", "The Ant and the Grasshopper",
    "In summer, Ant worked hard every day. She collected food and carried it to her home. Grasshopper didn't work. He played music and danced in the sun. \"Why are you working?\" he asked. \"It's summer! Come and play!\" \"I'm collecting food for the winter,\" said Ant.\nThen winter came. It was cold and there was snow on the ground. Grasshopper was hungry and he had no food. He knocked on Ant's door, and Ant gave him some food. \"Next summer, I'm going to work, too!\" said Grasshopper."],
  ["CPP2", 3, "everyday", "Recipe", "Fruit Salad",
    "Fruit Salad (for 4 people)\nIngredients: 1 banana, 1 cup of grapes, 1 slice of watermelon, 2 spoons of yogurt, 1 spoon of honey.\nFirst, wash your hands and the fruit. Then, cut the banana and the watermelon into small pieces. Next, put all the fruit in a big bowl. After that, mix the yogurt and the honey in a cup. Finally, pour the yogurt on the fruit and mix it. Your healthy dessert is ready. Enjoy!"],

  ["CPP2", 4, "fact", "Fact text", "How a Volcano Erupts",
    "The Earth's crust is divided into big pieces called plates. The plates move very slowly. Sometimes they push against each other and the ground shakes. This is an earthquake. Deep under the ground, rock is so hot that it melts. When it comes up through a crack, a volcano erupts. Hot lava flows down the mountain and gray ash goes up into the sky. Over many years, the lava cools and becomes new land. Volcanoes can be dangerous, but they also change our planet and make new islands."],
  ["CPP2", 4, "story", "Story", "The Long Walk",
    "It was the dry season on the savanna. There was no rain and the waterhole was nearly empty. Kito was a young elephant. \"We must migrate,\" said his grandmother, the leader of the herd. \"I know a place with water and green grass.\"\nThe herd walked for many days. Kito was tired and sleepy, but he didn't stop. Grandma had a great memory and she knew the way. At last, they saw a river and lots of green grass. The elephants drank and played in the water. \"Thank you, Grandma!\" said Kito."],
  ["CPP2", 4, "everyday", "Weather report", "Today's Weather",
    "Good morning! Here is today's weather. In the north, it is cloudy and windy, so take a jacket. In the mountains, it is snowy and cold. Be careful on the roads! In the south, it is sunny and hot. It's a great day for the beach, so don't forget your sunglasses. In the afternoon, there may be a storm near the lake, with rain and thunder. Tomorrow will be sunny everywhere. Have a nice day!"],

  ["CPP2", 5, "fact", "Fact text", "Instruments Around the World",
    "Music is part of every culture, and people play many different instruments. A guitar and a violin have strings. A flute and a trumpet are wind instruments: you blow into them. A drum makes a loud sound when you hit it. In Greece, people play the bouzouki at celebrations. In Scotland, you can hear bagpipes. Some music is relaxing, like a lullaby. Other music is loud and catchy, and it makes you want to dance. Music helps us express our feelings."],
  ["CPP2", 5, "story", "Story", "Lena's Concert",
    "Lena was nine and she played the piano. Next Saturday there was a school concert, and she was very nervous. \"What if I make a mistake?\" she asked her teacher, Mr. Ross. \"Practice every day and you can do it,\" he said. Lena practiced every afternoon.\nOn the day of the concert, the auditorium was full. Lena's hands were cold. Then she looked at her mom and dad in the audience and she started to play. The melody was beautiful. At the end, everyone clapped. Lena was so proud!"],
  ["CPP2", 5, "everyday", "Notice", "Join the Music Club!",
    "Do you like music? Can you play an instrument, or do you want to learn? Come to the Music Club!\nWhen: every Tuesday and Thursday after school, 3:30 to 4:30\nWhere: the music room\nYou can learn the guitar, the keyboard, the drums or the flute. Don't have an instrument? No problem! The school has instruments you can use. At the end of the year, we give a concert for our families. Talk to Ms. Park, the music teacher."],

  ["CPP2", 6, "fact", "Fact file", "Dinosaur Fact File",
    "Dinosaurs lived on Earth millions of years ago. Some were enormous. Brachiosaurus had a very long neck and it ate leaves from tall trees. It was a herbivore. T. rex was a carnivore. It had sharp teeth and it ate meat. Some dinosaurs had horns or thick skin to protect them. How do we know about them? Paleontologists study bones and footprints in rocks. Dinosaurs became extinct about 66 million years ago. Many scientists think a big asteroid from space hit the Earth."],
  ["CPP2", 6, "story", "Story", "The Egg in the Cave",
    "Last summer, Sam and his sister Rosie went to the mountains with their dad. One afternoon, they found a dark cave. Inside, there was a huge, round stone. \"It looks like a dinosaur egg!\" said Rosie. Sam laughed. \"Dinosaurs are extinct!\"\nSuddenly, they heard a booming voice: \"Who's in my cave?\" The children were scared and they ran out. Then Dad came out of the cave, laughing. \"It was me!\" he said. \"Sorry, it was a joke!\" Rosie and Sam laughed too, but they didn't go back into the cave."],
  ["CPP2", 6, "everyday", "Diary", "A Day at the Museum",
    "Dear Diary,\nToday our class went to the Natural History Museum. It was amazing! First, we saw a T. rex. It was enormous and its teeth were very sharp. Then a paleontologist talked to us. She showed us real dinosaur footprints and a bone from a Stegosaurus. After lunch, we made dinosaur models with clay. Mine had pointy horns and stripes. My favorite part was the dinosaur film. Now I want to study dinosaurs when I grow up!"],

  ["CPP2", 7, "fact", "Fact text", "Free Time in Ancient Egypt",
    "People in ancient Egypt worked hard, but they had free time, too. Children played with balls, spinning tops and dolls made of wood and clay. They also played leapfrog! Adults liked board games. One game was called Senet, and it was a bit like the board games we play today. People also went fishing on the river Nile, listened to music and danced at parties. Free time is important because it helps us relax and have fun with family and friends."],
  ["CPP2", 7, "story", "Story", "Robbie the Robot",
    "On Saturday it was raining, so Emma and her brother Nick stayed at home. Emma wanted to play video games, but Nick was bored. \"Let's make a robot!\" he said. They found some boxes, bottle caps and yarn. Emma cut the boxes and Nick glued the parts together. They painted the robot silver.\nThen Grandma came into the room. \"What a brilliant robot!\" she said. \"What's its name?\" \"Robbie!\" said Nick. That afternoon, they had a party with Robbie. It was the best rainy day ever."],
  ["CPP2", 7, "everyday", "Survey results", "Our Free-Time Survey",
    "Our class did a survey about free time. There are 24 students in our class. Ten students like playing video games best. Six students like playing sports, like soccer and baseball. Four students like reading, and two students like cooking with their families. Two students love their collections: Anna collects stickers and Ben collects marbles. Most students spend about two hours a day on free-time activities. We think free time is important because it is relaxing and fun."],

  ["CPP2", 8, "fact", "Fact text", "Dogs That Help",
    "Some dogs are real heroes. Guide dogs help blind people. They help them cross the street and walk safely in the city. Other dogs work with firefighters and paramedics. They have an amazing sense of smell, so they can find people after an earthquake or in the snow. Some dogs visit children in hospital to make them happy. These dogs train for many months. They need to be smart, calm and brave. People depend on them every day."],
  ["CPP2", 8, "story", "Story", "Mia Takes Charge",
    "One afternoon, Mia and her little brother Leo were at the park. Leo was on the monkey bars. Suddenly, he fell down and hurt his arm. He started to cry. Mia stayed calm. She asked a woman with a cell phone, \"Please, can you call an ambulance?\" Then she sat next to Leo and held his hand. \"Don't worry,\" she said. \"Help is on the way.\"\nThe paramedics came quickly and took care of Leo. Later, Mom hugged Mia. \"You were so brave and helpful,\" she said. \"You're a hero!\""],
  ["CPP2", 8, "everyday", "Blog post", "My Hero",
    "My hero is my aunt Helen. She's a nurse at the city hospital. She works long hours, sometimes at night, but she is always kind and caring. Last year, there was a big storm in our town and many people were hurt. Aunt Helen worked for two days and nights! She helped lots of people. She's also very funny and generous. Every summer, she takes me to the beach. When I grow up, I want to help people just like her."],

  ["CPP2", 9, "fact", "Fact text", "Everyday Inventions",
    "Many things we use every day were inventions. Long ago, people cleaned their teeth with sticks. Today we have toothbrushes and toothpaste. The first jeans were for miners because they needed strong clothes. The printing press helped people print books and newspapers quickly. Later, inventors made telephones, computers and smartphones. Now we can talk to people on the other side of the world! Inventions change our lives. What do you think people are going to invent in the future?"],
  ["CPP2", 9, "story", "Story", "Grandpa's Invention",
    "Grandpa loved inventing things. One day, he showed Zoe his newest invention: a machine for making breakfast. \"Press this button,\" he said. Zoe pressed the button. The machine started to shake. Then toast popped out and flew across the kitchen! Next, milk sprayed everywhere and the cereal landed on the cat. \"What a mess!\" said Zoe, laughing.\nGrandpa looked at his machine. \"Hmm. It needs a few changes,\" he said. \"Tomorrow, I'm going to fix it.\" Zoe smiled. \"I'll help you, Grandpa!\""],
  ["CPP2", 9, "everyday", "Notice", "Science Fair",
    "SCIENCE FAIR: Inventions for the Future!\nOur school science fair is on Friday, June 5th, in the gym. Young inventors from all classes can show their inventions and explain their experiments. Last year, we saw a solar oven, a robot that cleans the floor and a cup that never spills. This year's topic is \"Inventions to help our environment\". You can work alone or with a partner. Write your name on the list outside the science lab by May 20th. There are prizes for the best three inventions!"],

  /* ── Primary Path 3 ─────────────────────────────────────────────── */
  ["CPP3", 1, "fact", "Fact text", "Three Special Cities",
    "Every city has something special. In San Francisco, people ride old cable cars up and down the steep hills, and there is a famous orange bridge across the bay. Istanbul is divided between two continents, so many people cross from Europe to Asia by ferry every day. Its Grand Bazaar is one of the oldest markets in the world, full of rugs, gold and silver. In Melbourne, Australia, sports are a big part of life. Thousands of people go to the stadium to watch football and cricket. What makes your hometown special? Maybe it's the food, the people or an amazing place that everyone is proud of."],
  ["CPP3", 1, "story", "Story", "The New Kid",
    "When Leo moved to a new town, he felt nervous. He didn't know anybody at his new school, and the other kids already had best buddies. At recess, he sat alone on a bench.\nOn Thursday, his teacher, Mrs. Ruiz, gave the class a project: make a poster about something special in the town. She put Leo in a group with Amira and Josh. \"I don't know anything about this town,\" Leo said. \"Then we'll show you!\" said Amira. On Saturday, they explored the market, the old port and the park. Leo took photos and Josh wrote the captions. Their poster won a prize, and Leo had two new friends."],
  ["CPP3", 1, "everyday", "Blog post", "My Hometown",
    "Hi, I'm Eleni and this is my blog! Today I want to tell you about my hometown, Nafplio. It's a small town by the sea in the south of Greece. The old town has narrow streets with colorful houses and lots of cafés. Above the town there's a huge castle called Palamidi. People say you have to climb 999 steps to get there! In summer, tourists come from all over the world. My favorite thing to do is eat ice cream by the port with my friends. It's the perfect place to live. What's special about your town? Write a comment below!"],

  ["CPP3", 2, "fact", "Fact text", "What's for Breakfast?",
    "Breakfast is the first meal of the day, and it gives us energy for the morning. But people eat very different breakfasts around the world. In Japan, many families eat rice, fish and miso soup. In Mexico, people often have tortillas with beans and eggs. In the United States, pancakes with maple syrup are popular on weekends. In Greece, lots of people have yogurt with honey, or a slice of bread with olive oil. Doctors say a healthy breakfast should have protein, whole grains and fruit. If you skip breakfast, you might feel tired and hungry before lunch."],
  ["CPP3", 2, "story", "Story", "The Surprise Cake",
    "It was Mom's birthday and Jan wanted to bake her a cake. Dad was busy, so Jan decided to do it by himself. He looked up a recipe and got the ingredients: flour, sugar, butter, eggs and milk. He mixed everything in a big bowl and put it in the oven. While the cake was baking, he made the frosting.\nAfter a while, he smelled smoke! He ran to the kitchen and opened the oven. The cake was black on top. Jan was so upset. Then Dad came in. \"Don't worry,\" he said. \"We can cut off the top and add more frosting.\" Mom said it was the best cake she ever had."],
  ["CPP3", 2, "everyday", "Review", "Tasty Corner: A Review",
    "Last Saturday, my family went to Tasty Corner, a new restaurant downtown. The menu had lots of options, and the waiter was very friendly. For the appetizer, we shared some grilled vegetables with a yogurt sauce. For the main course, I ordered fish with roast potatoes. It was delicious, but a bit salty. My sister had pasta with tomato sauce, and my dad tried the seafood. The best part was dessert: chocolate pancakes with strawberries! I give Tasty Corner four stars out of five. You should try it!"],

  ["CPP3", 3, "fact", "Fact text", "Sea Turtles in Danger",
    "Sea turtles have lived in the oceans for millions of years, but today many of them are endangered. One big problem is plastic pollution. Turtles eat jellyfish, and a plastic bag in the water looks just like a jellyfish. When they eat plastic, they can get very sick. Turtles also get stuck in fishing nets by mistake. Another problem is global warming: turtles lay their eggs on beaches, and hotter sand changes the eggs. Luckily, people are helping. Volunteers clean beaches and protect the nests. We can help too: use less plastic and never leave trash on the beach."],
  ["CPP3", 3, "story", "Story", "The Storm",
    "Ana lived with her great-grandmother in a small house near the river. One night, there was a terrible storm. The wind was blowing hard and the rain didn't stop. In the morning, the river was rising fast. \"We need sandbags!\" said Ana's neighbor, Mr. Diaz.\nEveryone in the street helped. Ana and her friends carried sandbags and put them in front of the houses. It was hard work, and they were cold and covered in mud. By the evening, the water stopped rising. The houses were safe. Great-grandmother hugged Ana. \"When we work together,\" she said, \"nature is less scary.\""],
  ["CPP3", 3, "everyday", "Brochure", "Green Valley Rainforest Reserve",
    "Discover the Green Valley Rainforest Reserve! Our reserve protects more than 300 kinds of animals, including jaguars, sloths and colorful parrots. Join a guided walk with our biologists and learn about this amazing habitat.\nRules for visitors: Stay on the paths. Don't feed or touch the animals. Take all your trash home with you. Don't pick plants or flowers.\nOpen: Tuesday to Sunday, 9 a.m. to 5 p.m.\nTickets: adults $12, children $6. All the money helps to protect endangered animals. Remember: this is their home, and you are the visitor!"],

  ["CPP3", 4, "fact", "Fact text", "Art in Unusual Places",
    "Art isn't only in museums. In many cities, you can see huge murals on the walls of buildings. Some artists make sculptures from recycled materials, like plastic bottles, bottle caps and old metal. Sand artists build amazing sandcastles on the beach, but the sea washes them away after a few hours, so their art is temporary. Other artists draw with chalk on the street, and their pictures look 3D when you stand in the right place! Some people think art should be permanent, but others think art is more special because it doesn't last. What do you think?"],
  ["CPP3", 4, "story", "Story", "The Art Competition",
    "Nina loved drawing, but she was shy and never showed her pictures to anyone. One day, the school announced an art competition. The topic was \"My Family\". Nina's best friend, Theo, said, \"You should enter!\" Nina wasn't sure, but she worked on a portrait of her grandmother for two weeks. She used watercolor paint and lots of tiny details.\nOn the day of the awards ceremony, Nina was nervous. The principal stepped forward and said, \"And the first prize goes to… Nina Petrou!\" Everyone clapped and cheered. Nina's grandmother was in the audience, and she had tears in her eyes."],
  ["CPP3", 4, "everyday", "Diary", "A Visit to the Gallery",
    "Saturday, March 3rd\nToday Mom and I visited the new art gallery downtown. I thought it was going to be boring, but I was wrong! In the first room, there were old paintings of landscapes and portraits. The next room was my favorite. There was a giant peacock made of colorful bottle caps, and a sculpture of a bull made of old bicycles. In the last room, we tried pottery. I made a small vase with clay. It's not perfect, but I'm proud of it. Next time, I want to bring my sketchbook and draw the sculptures."],

  ["CPP3", 5, "fact", "Fact text", "Travel Without Harm",
    "Millions of tourists travel around the world every year. Travel helps us learn about other cultures, try new food and see amazing places. But tourism can also damage nature. Some beaches are full of trash, and too many visitors can scare wild animals. That's why ecotourism is becoming popular. Ecotourists choose small local hotels, use public transport and buy souvenirs from local artists. They never feed wild animals and they always take their trash home. Some even volunteer at animal sanctuaries on vacation. When we travel responsibly, the places we love stay unspoilt for the next visitors."],
  ["CPP3", 5, "story", "Story", "Lost on the Trail",
    "Last summer, Maya and her cousin Alex went hiking with their parents near a beautiful waterfall. Alex wanted to take a photo of a strange lizard, so they left the trail for a few minutes. When they turned around, they couldn't see their parents. \"Which way is the trail?\" asked Maya. Alex didn't know.\nThey felt scared, but Maya remembered her dad's advice: \"If you get lost, stay where you are.\" They sat under a big tree and shouted every few minutes. After half an hour, they heard their dad's voice. He was so happy to see them! Since then, Alex always stays on the trail."],
  ["CPP3", 5, "everyday", "Postcard", "Greetings from Costa Rica",
    "Dear Grandpa,\nGreetings from Costa Rica! We've been here for five days and it's incredible. On Monday, we went whitewater rafting on a river. It was scary but so much fun! On Wednesday, we visited a sloth sanctuary. The sloths are so cute and they move really slowly. Yesterday, we went kayaking in a mangrove forest and saw a crocodile, from far away! Tomorrow we're going to the beach to see the sea turtles. I bought you a souvenir: a small wooden parrot.\nSee you soon!\nLove, Daniel"],

  ["CPP3", 6, "fact", "Fact text", "The Olympic Games",
    "The first Olympic Games took place in ancient Greece, in Olympia, almost 3,000 years ago. Only men could compete, and the winners got a crown made of olive leaves, not a medal. The modern Olympics started in Athens in 1896. Today, athletes from more than 200 countries take part, and there are summer and winter Games. First place gets a gold medal, second place gets silver, and third place gets bronze. The Olympic flag has five rings in different colors, a symbol of the continents coming together. The Paralympic Games are for athletes with a disability, and they are just as exciting."],
  ["CPP3", 6, "story", "Story", "The Final Match",
    "The Speedy Squirrels needed one more win to become champions of the league. But on the day of the final match, their captain, Rosa, hurt her ankle in the warm-up. \"You'll have to watch from the bench,\" said the coach. The team was worried. Without Rosa, they were losing 1–0 at half-time.\nRosa didn't give up. She shouted from the bench and encouraged every player. \"Pass the ball! Work together!\" In the second half, Kostas scored, and two minutes before the end, Lily scored again! The Squirrels won 2–1. They gave the trophy to Rosa first. \"You were our twelfth player,\" they said."],
  ["CPP3", 6, "everyday", "Interview", "Meet a Young Gymnast",
    "Q: When did you start gymnastics?\nA: When I was five. My mom took me to a class and I loved it!\nQ: How often do you train?\nA: Four times a week, for three hours. On Saturdays I also go to the gym with my team.\nQ: Is it hard?\nA: Yes, very! You need discipline, and sometimes you fall and get hurt. But when I learn a new skill, I feel amazing.\nQ: What's your dream?\nA: I want to compete internationally and maybe win a medal one day.\nQ: Any advice for young athletes?\nA: Never give up, and always listen to your coach!"],

  ["CPP3", 7, "fact", "Fact text", "Secrets Under the Ground",
    "Archeologists are scientists who study the past. They dig carefully in the ground to find artifacts: things that people made and used a long time ago, like pots, coins, jewels and tools. In 1922, an archeologist named Howard Carter found the tomb of a young pharaoh, Tutankhamun, in Egypt. Inside, there was a gold mask and hundreds of precious objects. Some treasures are found under the sea, in old shipwrecks. Today, archeologists also use lasers and computers to find buried things without digging. Every artifact tells us something about how people lived."],
  ["CPP3", 7, "story", "Story", "The Letter in the Drawer",
    "Sophie was helping her grandfather clean his dusty attic when she found an old wooden drawer. Inside, there was an envelope with a red seal. \"Can I open it?\" she asked. Grandpa nodded. It was a letter from 1950, written by his father. It said, \"I buried something precious under the olive tree in the garden.\"\nSophie and Grandpa got a shovel and started to dig. After an hour, they found a small metal box. Inside, there were old photos, a gold medal and a note: \"For my family. Never forget where you came from.\" Grandpa smiled. \"My father was a champion runner,\" he said quietly."],
  ["CPP3", 7, "everyday", "News report", "Students Find Buried Treasure",
    "LOCAL STUDENTS FIND BURIED TREASURE\nA group of students from Riverside School made an amazing discovery last Tuesday. They were on a school trip near the old castle when one of them, 12-year-old Ben Carter, noticed something shiny in the dirt. It was a silver coin! The students called their teacher, who contacted the town museum. Experts came and found 23 more coins buried in the same place. They think the coins are about 400 years old. \"Who buried them, and why? It's a mystery we want to solve,\" said one expert. \"We were so excited,\" said Ben. \"I want to be an archeologist now!\" The coins will be on display at the museum from next month."],

  ["CPP3", 8, "fact", "Fact text", "Where Does Electricity Come From?",
    "We use electricity every day for lights, fridges, computers and cell phones. But where does it come from? Most electricity is made in power plants. Many power plants burn coal, oil or gas. These are fossil fuels. They are non-renewable, which means they will run out one day, and they also pollute the air. Renewable sources are better for the environment. Wind turbines use wind power, solar panels use the light of the sun, and hydroelectric power plants use the power of water. We can all help by saving energy: switch off lights, unplug chargers and don't leave the TV on."],
  ["CPP3", 8, "story", "Story", "The Night the Lights Went Out",
    "It was a stormy evening and Nikos was playing video games when suddenly everything went dark. There was no electricity in the whole street! \"What do we do now?\" he complained. Mom found some candles and a flashlight. Dad couldn't cook dinner on the electric stove, so they had bread, cheese and fruit.\nWithout the TV or the computer, the family sat together in the living room. Grandma told funny stories about her childhood, when there were no cell phones. Nikos and his sister played board games. At ten o'clock, the lights came back on. \"Oh,\" said Nikos. \"Can we switch them off again?\""],
  ["CPP3", 8, "everyday", "Advertisement", "The SunBox Solar Charger",
    "NEW! The SunBox Solar Charger\nDo you always run out of battery? The SunBox uses solar power to charge your cell phone, tablet or headphones anywhere: at the beach, on a camping trip or in the park! Just leave it in the sun for four hours and it's ready. It's small, light and waterproof. It's also environmentally friendly: no plugs, no waste, no electricity bills!\nPrice: only $29.99. Buy it now at your local electronics store or online. Keep your receipt: if you aren't happy, you can bring it back within 30 days."],

  ["CPP3", 9, "fact", "Fact text", "Instruments of the Orchestra",
    "An orchestra is a large group of musicians who play together. There are four families of instruments. String instruments, like the violin and the double bass, have strings that you play with a bow or your fingers. Woodwind instruments, like the flute and the piccolo, make a sound when you blow into them. Brass instruments, like the trumpet and the tuba, are made of metal. Percussion instruments, like drums, make sounds when you hit or shake them. The conductor stands on a podium in front of the orchestra and shows the musicians when to play, how fast and how loudly."],
  ["CPP3", 9, "story", "Story", "The School Band",
    "Leo couldn't play any instrument, but he loved music. When the school band needed a drummer, he decided to try. At first, it was a disaster. He was always too fast or too slow, and the other musicians laughed. \"Maybe music isn't for me,\" he told Ms. Kim, the band teacher. \"Rhythm takes patience,\" she said. \"Practice ten minutes every day.\"\nSo he did. He practiced on pots and pans in the kitchen, on his desk, even on his knees on the bus. Three months later, the band gave a concert in the auditorium. Leo played every beat perfectly, and the audience clapped along to his drum solo."],
  ["CPP3", 9, "everyday", "Email", "Guitar Lessons",
    "Hi Chris,\nGuess what? I've started guitar lessons! My teacher is a young musician called Alex, and he plays in a jazz band. The first lessons were hard. My fingers hurt because the strings are made of metal! But now I can read sheet music and play three songs, including a lullaby for my baby sister. She always falls asleep when I play it. Alex says I have a good sense of rhythm. Next month, our music school is giving a performance in the auditorium, and I'm going to play with two other students. Can you come? It's on Saturday the 14th at 6 p.m.\nWrite back soon!\nMatt"],
];

export const READING_TEXTS = TEXTS.map(([bookId, unit, kind, genre, title, text]) => ({
  id: `${bookId}-U${unit}-${kind}`, bookId, unit, kind, genre, title, text,
}));

const BY_ID = new Map(READING_TEXTS.map((t) => [t.id, t]));

export const readingText = (id) => BY_ID.get(String(id || "")) || null;

export const wordCount = (text) => (String(text || "").match(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g) || []).length;

/** The unit words a text uses (whole words or phrases, any of their listed forms, with -s / -es / -ed / -ing). */
export function textUnitWords(t) {
  if (!t) return [];
  const hay = ` ${String(t.text).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ")} `;
  const quote = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forms = (base) => {
    const out = [base, `${base}s`, `${base}es`, `${base}ed`, `${base}d`, `${base}ing`];
    if (base.endsWith("e")) out.push(`${base.slice(0, -1)}ing`);
    if (base.endsWith("y")) out.push(`${base.slice(0, -1)}ies`, `${base.slice(0, -1)}ied`);
    return out;
  };
  const seen = new Set();
  return unitWords(t.bookId, t.unit).filter((w) => {
    const key = String(w.english).toLowerCase();
    if (seen.has(key)) return false;
    // "dig - dug - dug", "goose-geese", "leaf - leaves", "look (something) up" → each listed form.
    const pair = key.match(/^([a-z]+)-([a-z]+)$/);
    const forms2 = pair && pair[1].slice(0, 2) === pair[2].slice(0, 2) ? [pair[1], pair[2]] : null;
    const bases = (forms2 || key.replace(/\([^)]*\)/g, " ").split(/\s+-\s+/)).map((b) => b.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim()).filter((b) => b.length >= 3);
    const hit = bases.some((b) => forms(b).some((f) => hay.includes(` ${f} `)));
    if (hit) seen.add(key);
    return hit;
  }).map((w) => w.english);
}

/** The texts of one or more units of a book, in book order (fact, story, everyday for each unit). */
export function textsFor(bookId, units = []) {
  const want = new Set((units || []).map(Number));
  return READING_TEXTS.filter((t) => t.bookId === bookId && want.has(t.unit));
}
