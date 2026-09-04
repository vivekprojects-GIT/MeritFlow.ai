import type { EnrichedCourse, VideoInfo } from './course-schema';

/**
 * Two fully built courses so the app can be explored without API keys.
 * Every embedded video is a real, verified-embeddable YouTube video that is
 * specific to its lesson's topic. Durations/view counts are approximate, for display only.
 */

function vid(
  id: string,
  title: string,
  channel: string,
  durationSeconds: number,
  views: number,
): VideoInfo {
  return {
    id,
    title,
    channel,
    url: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds,
    views,
    publishedAt: '',
  };
}

const python: EnrichedCourse = {
  title: 'Python Programming for Beginners',
  subtitle: 'Go from zero to writing real programs',
  description:
    'A hands-on introduction to programming with Python, the most beginner-friendly language in tech. You will write code from your very first lesson and finish by building a small interactive program of your own.',
  level: 'Beginner',
  estimatedHours: 14,
  prerequisites: ['No prior programming experience needed', 'A computer where you can install Python'],
  outcomes: [
    'Write and run Python programs with confidence',
    'Use variables, data types, conditionals, and loops',
    'Organize code into reusable functions',
    'Work with lists, dictionaries, and files',
    'Build a small command-line program from scratch',
  ],
  modules: [
    {
      title: 'Getting Started',
      summary: 'Set up Python and learn the absolute basics of writing code.',
      lessons: [
        {
          title: 'Why Learn Python?',
          objective: 'Understand what makes Python a great first language and where it gets used.',
          intro:
            'Before writing any code, it helps to know why Python is worth your time. It is consistently one of the most popular languages in the world, and it is the language most schools and bootcamps now teach first.',
          sections: [
            {
              heading: 'Readable by design',
              body: 'Python was built around the idea that code is read far more often than it is written. It uses plain indentation and near-English keywords instead of curly braces and semicolons, so you can focus on solving the problem rather than wrestling with syntax. That is a big part of why beginners get productive in it so quickly.',
            },
            {
              heading: 'Used almost everywhere',
              body: 'The same language powers data analysis at banks, machine learning at AI labs, automation scripts for IT teams, and the backends of huge websites. Learning Python does not lock you into one niche; it gives you a foundation you can carry into data science, web development, or everyday scripting.',
            },
          ],
          keyPoints: [
            'Python emphasizes readability, which lowers the barrier for beginners.',
            'It is general-purpose: data, AI, web, and automation.',
            'Skills transfer to nearly every corner of programming.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Thinking you must master every feature before building anything.',
            'Assuming Python is only for data science, when it is genuinely general-purpose.',
          ],
          practice:
            'Write down one project you would love to build. We will keep coming back to it as your skills grow.',
          needsVideo: false,
          videoQuery: '',
          video: null,
        },
        {
          title: 'Install Python and Run Your First Program',
          objective: 'Install Python and run a script that prints to the screen and reads input.',
          intro:
            'Every Python journey starts the same way: get the interpreter onto your machine, then run a tiny program to prove the setup works from end to end.',
          sections: [
            {
              heading: 'Installing Python',
              body: 'Download the latest version from python.org and run the installer. On Windows, check the box that adds Python to your PATH during installation, which lets you run Python from any terminal. Confirm it worked by opening a terminal and typing python --version, which should print the version number.',
            },
            {
              heading: 'Your first script',
              body: 'Create a file ending in .py, write a single print statement, and run it with python and the file name. The print function displays text on the screen, and the input function pauses to read what the user types. Those two functions are enough to make your first interactive program.',
            },
          ],
          keyPoints: [
            'Install from python.org and add Python to your PATH.',
            'Verify the install with python --version.',
            'Run a script with: python filename.py',
            'print() shows text; input() reads what the user types.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `# hello.py\nprint("Hello, world!")\n\nname = input("What is your name? ")\nprint("Welcome to Python,", name)`,
              caption: 'Print a message, then greet the user by name.',
            },
          ],
          commonMistakes: [
            'Forgetting to add Python to PATH, so the terminal cannot find it.',
            'Saving the file with a .txt extension instead of .py.',
            'Running the file from the wrong folder in the terminal.',
          ],
          practice:
            "Change the program so it also asks for the user's favorite hobby and prints a sentence using both their name and hobby.",
          needsVideo: true,
          videoQuery: 'how to install python and run first program tutorial',
          video: vid(
            'YYXdXT2l-Gg',
            'Python Tutorial for Beginners 1: Install and Setup for Mac and Windows',
            'Corey Schafer',
            1080,
            3_000_000,
          ),
        },
        {
          title: 'Variables and Data Types',
          objective: "Store and label data using variables and Python's core types.",
          intro:
            'A variable is just a name that points to a value. Python figures out the type for you, so you spend less time on declarations and more time on logic.',
          sections: [
            {
              heading: 'Creating variables',
              body: 'You make a variable with a single equals sign, like age = 30. There is no need to declare a type first, which is called dynamic typing. You can reassign a variable at any time, and it can even hold a different kind of value than it did before.',
            },
            {
              heading: 'The core types',
              body: 'Four types cover most beginner work: integers for whole numbers, floats for decimals, strings for text wrapped in quotes, and booleans which are either True or False. You can always check a value with the built-in type() function, which is handy when a program behaves unexpectedly.',
            },
          ],
          keyPoints: [
            'Create variables with name = value; no type declaration needed.',
            'Core types are int, float, str, and bool.',
            'Python is dynamically typed, so a variable can change type.',
            'type(x) tells you the type of any value.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `age = 30           # int\nprice = 19.99      # float\nname = "Ada"       # str\nis_student = True  # bool\n\nprint(type(age), type(price))`,
              caption: 'The four most common data types and how to inspect them.',
            },
          ],
          commonMistakes: [
            'Forgetting quotes around text, so Python treats it as a variable name.',
            'Mixing up = (assignment) with == (comparison).',
            'Expecting whole-number division: 7 / 2 gives 3.5, not 3.',
          ],
          practice:
            'Create variables for your name, age, and height, then print one sentence that combines all three.',
          needsVideo: true,
          videoQuery: 'python variables and data types tutorial',
          video: vid(
            'cQT33yu9pY8',
            'Python Variables - Python Tutorial for Beginners with Examples',
            'Programming with Mosh',
            420,
            700_000,
          ),
        },
      ],
      quiz: [
        {
          question: 'What is one of the main reasons Python is considered beginner-friendly?',
          options: [
            'It uses indentation and near-English keywords for readability',
            'It forces you to declare the type of every variable',
            'It has no functions or loops to learn',
            'It only runs inside a web browser',
          ],
          answerIndex: 0,
          explanation: 'Python was designed around readability, using indentation and plain keywords instead of heavy symbols.',
        },
        {
          question: 'Which command checks the installed Python version from a terminal?',
          options: ['python --version', 'print(version)', 'version()', 'py.check()'],
          answerIndex: 0,
          explanation: 'Running python --version prints the installed version, confirming the setup works.',
        },
        {
          question: "What are Python's four core basic data types?",
          options: [
            'int, float, str, and bool',
            'array, struct, char, and double',
            'number, text, flag, and money',
            'list, tuple, set, and dict',
          ],
          answerIndex: 0,
          explanation: 'Integers, floats, strings, and booleans cover most beginner work.',
        },
        {
          question: 'What does the input() function do?',
          options: [
            'Reads text the user types in',
            'Prints text to the screen',
            'Declares the type of a variable',
            'Installs a Python package',
          ],
          answerIndex: 0,
          explanation: 'input() pauses the program and returns whatever the user types as a string.',
        },
      ],
    },
    {
      title: 'Controlling Your Program',
      summary: 'Make decisions, repeat work, and organize logic into functions.',
      lessons: [
        {
          title: 'Making Decisions with if / elif / else',
          objective: 'Run different code depending on conditions.',
          intro:
            'Programs get useful when they can make decisions. The if statement lets your code take different paths depending on whether a condition is true.',
          sections: [
            {
              heading: 'if, elif, and else',
              body: 'An if block runs only when its condition is true. You can chain more checks with elif (short for else-if) and provide a catch-all with else. Python checks each condition from top to bottom and runs the first one that matches, then skips the rest.',
            },
            {
              heading: 'Building conditions',
              body: 'Conditions usually compare values with operators like == (equal), != (not equal), and the greater-than or less-than signs. You can combine them with and, or, and not to express richer logic, such as a user being over 18 and having agreed to the terms.',
            },
          ],
          keyPoints: [
            'if runs a block only when its condition is True.',
            'elif adds more cases; else is the fallback.',
            'Compare with ==, !=, >, < and combine with and, or, not.',
            'Indentation decides what belongs inside each branch.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `score = 82\n\nif score >= 90:\n    grade = "A"\nelif score >= 80:\n    grade = "B"\nelse:\n    grade = "C"\n\nprint("Your grade is", grade)`,
              caption: 'Choosing one path out of several with if / elif / else.',
            },
          ],
          commonMistakes: [
            'Using = instead of == inside a condition.',
            'Forgetting the colon at the end of the if line.',
            'Inconsistent indentation, which changes which code runs.',
          ],
          practice:
            'Write a program that reads a number and prints whether it is positive, negative, or zero.',
          needsVideo: true,
          videoQuery: 'python if elif else statements tutorial',
          video: vid(
            'DZwmZ8Usvnk',
            'Python Tutorial for Beginners 6: Conditionals and Booleans - If, Else, and Elif Statements',
            'Corey Schafer',
            1260,
            1_500_000,
          ),
        },
        {
          title: 'Repeating Work with Loops',
          objective: 'Automate repetitive tasks using for and while loops.',
          intro:
            'Loops let a few lines of code do a huge amount of work. Instead of copying a statement ten times, you write it once and tell Python to repeat it.',
          sections: [
            {
              heading: 'for loops',
              body: 'A for loop walks through a sequence one item at a time, such as a list, a string, or a range of numbers. The call range(1, 6) produces the numbers 1 through 5, which makes for loops ideal for counting or processing every item in a collection.',
            },
            {
              heading: 'while loops',
              body: 'A while loop keeps running as long as its condition stays true, which is ideal when you do not know in advance how many repetitions you need. Just make sure something inside the loop eventually makes the condition false, or it will run forever.',
            },
          ],
          keyPoints: [
            'for iterates over a known sequence.',
            'while repeats until a condition becomes False.',
            'range(n) generates 0 to n-1 for counting loops.',
            'break exits a loop early; continue skips to the next round.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `# Sum the numbers 1 through 5\ntotal = 0\nfor n in range(1, 6):\n    total += n\n\nprint(total)  # 15`,
              caption: 'A for loop that adds up a range of numbers.',
            },
          ],
          commonMistakes: [
            'Writing a while loop whose condition never becomes false (an infinite loop).',
            'Off-by-one errors: range(5) is 0 to 4, not 1 to 5.',
            'Changing a list while looping over it.',
          ],
          practice: 'Use a loop to print the 7 times table, from 7 x 1 up to 7 x 10.',
          needsVideo: true,
          videoQuery: 'python for and while loops tutorial',
          video: vid(
            '6iF8Xb7Z3wQ',
            'Python Tutorial for Beginners 7: Loops and Iterations - For/While Loops',
            'Corey Schafer',
            1320,
            1_300_000,
          ),
        },
        {
          title: 'Functions: Reusable Blocks of Code',
          objective: 'Package logic into reusable, named functions.',
          intro:
            'As programs grow, you will repeat the same steps in many places. Functions let you name a block of code once and reuse it anywhere.',
          sections: [
            {
              heading: 'Defining and calling',
              body: 'You define a function with def, give it a name, and list any inputs (parameters) in parentheses. The code runs only when you call the function by name. This keeps your program organized and saves you from copying the same logic around.',
            },
            {
              heading: 'Parameters and return values',
              body: 'Parameters let you pass data into a function, and the return statement sends a result back out. A function that returns a value can be used in expressions, like total = add(2, 3). If you do not return anything, the function still runs and simply gives back None.',
            },
          ],
          keyPoints: [
            'Define functions with def name(parameters):',
            'Call a function by its name with arguments in parentheses.',
            'return sends a value back to the caller.',
            'Each function should do one clear job.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `def greet(name):\n    return f"Hello, {name}!"\n\nmessage = greet("Sam")\nprint(message)  # Hello, Sam!`,
              caption: 'Defining a function and using its return value.',
            },
          ],
          commonMistakes: [
            'Defining a function but forgetting to call it, so nothing runs.',
            'Confusing print and return: print shows text, return hands back a value.',
            'Forgetting the colon or the indentation of the function body.',
          ],
          practice:
            'Write a function area(width, height) that returns the area of a rectangle, then print the area of a 4 by 6 rectangle.',
          needsVideo: true,
          videoQuery: 'python functions tutorial for beginners',
          video: vid(
            '9Os0o3wzS_I',
            'Python Tutorial for Beginners 8: Functions',
            'Corey Schafer',
            1320,
            1_400_000,
          ),
        },
      ],
      quiz: [
        {
          question: 'Which keyword provides the catch-all branch when no if/elif condition matched?',
          options: ['else', 'elif', 'default', 'finally'],
          answerIndex: 0,
          explanation: 'else runs when none of the preceding if/elif conditions were true.',
        },
        {
          question: 'What numbers does range(1, 6) produce?',
          options: ['1, 2, 3, 4, 5', '1 through 6', '0 through 6', 'just 1 and 6'],
          answerIndex: 0,
          explanation: 'range stops before the second argument, so range(1, 6) yields 1 to 5.',
        },
        {
          question: 'What does a function’s return statement do?',
          options: [
            'Sends a value back to the code that called the function',
            'Prints the value to the screen',
            'Immediately ends the whole program',
            'Defines a new variable type',
          ],
          answerIndex: 0,
          explanation: 'return hands a result back to the caller so it can be used in expressions.',
        },
        {
          question: 'What happens if a while loop’s condition never becomes false?',
          options: [
            'It runs forever — an infinite loop',
            'It stops automatically after 10 rounds',
            'It raises a syntax error',
            'It is skipped entirely',
          ],
          answerIndex: 0,
          explanation: 'Something inside the loop must eventually make the condition false, or it never stops.',
        },
      ],
    },
    {
      title: 'Working with Data and Building Something',
      summary: 'Use collections and files, then combine everything into a real project.',
      lessons: [
        {
          title: 'Lists and Dictionaries',
          objective: "Group related data using Python's two essential collections.",
          intro:
            'Real programs rarely deal with one value at a time. Lists and dictionaries are the two workhorses for storing collections of data.',
          sections: [
            {
              heading: 'Lists',
              body: 'A list is an ordered collection written in square brackets. You can add to it with append, remove items, loop over it, and grab an item by its position (its index), counting from 0. Lists are perfect when order matters or you have a sequence of similar things.',
            },
            {
              heading: 'Dictionaries',
              body: 'A dictionary stores data as key-value pairs, where each value has a meaningful label called a key. Instead of looking things up by position, you look them up by that key. Dictionaries shine when each piece of data has a natural name, like the fields of a user profile.',
            },
          ],
          keyPoints: [
            'Lists are ordered; access items by index starting at 0.',
            'Use append() to add an item to a list.',
            'Dictionaries map keys to values; look up by key.',
            'Choose a list for sequences, a dictionary for labelled data.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `tasks = ["email", "lunch", "code"]\ntasks.append("review")\n\nuser = {"name": "Ada", "age": 36}\nprint(tasks[0])      # email\nprint(user["name"])  # Ada`,
              caption: 'A list of tasks and a dictionary describing a user.',
            },
          ],
          commonMistakes: [
            'Using an index that runs off the end of the list.',
            'Forgetting that list indexes start at 0, not 1.',
            'Looking up a dictionary key that does not exist, which raises an error.',
          ],
          practice:
            'Make a dictionary describing a book with a title, author, and year, then print a sentence using each value.',
          needsVideo: true,
          videoQuery: 'python lists and dictionaries tutorial',
          video: vid('HJjRYD1N9Kc', 'Lists and Dictionaries in Python', 'The Zuri Team', 900, 60_000),
        },
        {
          title: 'Reading and Writing Files',
          objective: 'Save data to a file and read it back.',
          intro:
            'Programs become genuinely useful when they can remember things between runs. Files are the simplest way to make data persist.',
          sections: [
            {
              heading: 'The with statement',
              body: 'The safest way to work with a file is a with block: you open the file, do your work inside the indented block, and Python automatically closes it when the block ends. That happens even if something goes wrong, so you do not leak resources or lose data.',
            },
            {
              heading: 'Reading and writing modes',
              body: 'You open a file in a mode: r to read, w to write (which replaces the contents), or a to append to the end. Use the write method to put text in and the read method to pull it back out. This is the foundation for working with logs, settings, and exported data.',
            },
          ],
          keyPoints: [
            'Use a with block to open files so they close automatically.',
            'Modes: r (read), w (overwrite), a (append).',
            'Writing in w mode erases the existing contents first.',
            'read() returns the whole file as one string.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `with open("notes.txt", "w") as f:\n    f.write("Practice a little every day.\\n")\n\nwith open("notes.txt", "r") as f:\n    print(f.read())`,
              caption: 'Write a line to a file, then read it back.',
            },
          ],
          commonMistakes: [
            'Opening in w mode when you meant a, which erases the file.',
            'Forgetting that read() returns everything as one big string.',
            'Using a relative path and looking in the wrong folder for the file.',
          ],
          practice: 'Write a program that appends a new line to a journal.txt file every time you run it.',
          needsVideo: true,
          videoQuery: 'python reading and writing files tutorial',
          video: vid(
            'Uh2ebFW8OYM',
            'Python Tutorial: File Objects - Reading and Writing to Files',
            'Corey Schafer',
            1440,
            1_300_000,
          ),
        },
        {
          title: 'Project: A Command-Line To-Do App',
          objective: 'Combine everything into a small interactive program.',
          intro:
            'Time to put it all together. A command-line to-do app uses every concept from this course, and building something end to end is the fastest way to make the ideas stick.',
          sections: [
            {
              heading: 'How the pieces fit',
              body: 'The app needs a list to hold tasks, a while loop to keep it running, conditionals to decide what the user asked for, and the input function to read commands. That is variables, loops, conditionals, and collections all working together in one place.',
            },
            {
              heading: 'Start small, then grow',
              body: 'Begin with three commands: add a task, list all tasks, and quit. Once that works, new features like deleting a task or saving to a file become small additions rather than a daunting rewrite. Shipping a tiny working version first is a habit that serves you for your whole career.',
            },
          ],
          keyPoints: [
            'Real programs combine variables, loops, conditionals, and collections.',
            'Build the smallest version that works, then extend it.',
            'enumerate() gives you a number and the item together when listing.',
            'break is what lets the user quit the loop.',
          ],
          codeExamples: [
            {
              language: 'python',
              code: `tasks = []\n\nwhile True:\n    command = input("add / list / quit: ").strip()\n    if command == "add":\n        tasks.append(input("Task: "))\n    elif command == "list":\n        for i, task in enumerate(tasks, 1):\n            print(i, task)\n    elif command == "quit":\n        break`,
              caption: 'A complete, minimal command-line to-do loop.',
            },
          ],
          commonMistakes: [
            'Forgetting the break, so the quit command never exits.',
            'Not handling unknown commands, which leaves the user confused.',
            'Trying to add every feature at once instead of starting small.',
          ],
          practice: "Extend the app with a 'done' command that removes a task by its number.",
          needsVideo: true,
          videoQuery: 'python to do list app project tutorial',
          video: vid(
            '95wqI4iGwPI',
            'Python To-Do List Project | Simple Console Based App',
            'Tech With Rathan',
            1200,
            40_000,
          ),
        },
      ],
      quiz: [
        {
          question: 'How do you look up a value stored in a dictionary?',
          options: ['By its key', 'By its index position', 'With append()', 'Using range()'],
          answerIndex: 0,
          explanation: 'Dictionaries map keys to values, so you retrieve a value by its key.',
        },
        {
          question: 'In Python, list indexes start at which number?',
          options: ['0', '1', '-1', 'the length of the list'],
          answerIndex: 0,
          explanation: 'The first item of a list is at index 0.',
        },
        {
          question: 'What does opening a file in "w" mode do to its existing contents?',
          options: ['Overwrites and erases them', 'Appends to them', 'Reads them', 'Leaves them unchanged'],
          answerIndex: 0,
          explanation: 'Write mode replaces the file contents; use "a" to append instead.',
        },
        {
          question: 'Why is it good practice to open files inside a with block?',
          options: [
            'It closes the file automatically when the block ends',
            'It makes files load faster',
            'It encrypts the file',
            'It is the only way to read a file',
          ],
          answerIndex: 0,
          explanation: 'A with block guarantees the file is closed even if an error occurs.',
        },
      ],
    },
  ],
};

const uiux: EnrichedCourse = {
  title: 'UI/UX Design Fundamentals',
  subtitle: 'Design products people love to use',
  description:
    'A practical introduction to user experience and interface design. You will learn the principles behind great products, walk through the design process, and pick up the craft skills that separate good work from amateur work — no design background required.',
  level: 'Beginner',
  estimatedHours: 11,
  prerequisites: ['No design background required', 'A free Figma account is helpful for hands-on practice'],
  outcomes: [
    'Explain the difference between UX and UI and why both matter',
    'Apply core visual design principles like hierarchy and contrast',
    'Choose and apply effective, accessible color palettes',
    'Run lightweight user research and turn ideas into wireframes',
    'Build a clickable prototype in Figma',
    'Present your work in a compelling portfolio',
  ],
  modules: [
    {
      title: 'Foundations',
      summary: 'The core ideas every designer builds on.',
      lessons: [
        {
          title: "UX vs UI — What's the Difference?",
          objective: 'Distinguish user experience from user interface and see how they work together.',
          intro:
            'People use these two terms interchangeably, but they describe different things. Knowing the difference is the first real step into design.',
          sections: [
            {
              heading: 'UX is how it works',
              body: 'User experience is about the journey: can people accomplish their goal without confusion or frustration? It covers the flow between screens, the logic of a process, and whether the right information appears at the right moment. Good UX is often invisible — you only notice it when it is missing.',
            },
            {
              heading: 'UI is how it looks',
              body: 'User interface is the visual and interactive layer: the colors, typography, buttons, spacing, and the way elements respond when you touch them. A strong UI makes a product feel trustworthy and easy to scan. The two depend on each other; a beautiful interface cannot rescue a confusing experience.',
            },
          ],
          keyPoints: [
            'UX is how it works; UI is how it looks.',
            'Both are essential — one cannot rescue the other.',
            'Good UX is often invisible; you notice it when it fails.',
            'Designers move fluidly between the two.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Treating UI and UX as the same job.',
            'Polishing visuals before the flow actually works.',
            'Designing for how it looks in a portfolio rather than how it feels to use.',
          ],
          practice:
            'Open an app you use daily and name one thing that is great UX and one thing that is great or poor UI.',
          needsVideo: true,
          videoQuery: 'what is UI vs UX design explained',
          video: vid(
            'zHAa-m16NGk',
            "What is UI vs. UX Design? | What's The Difference? | UX/UI Explained in 2 Minutes For BEGINNERS.",
            'Zero To Mastery',
            130,
            250_000,
          ),
        },
        {
          title: 'The Core Principles of Visual Design',
          objective: 'Apply hierarchy, contrast, alignment, and whitespace to organize a screen.',
          intro:
            'A handful of timeless principles do most of the heavy lifting in good design. Master these and your work will instantly look more intentional.',
          sections: [
            {
              heading: 'Hierarchy and contrast',
              body: 'Visual hierarchy guides the eye to the most important thing first, usually through size, weight, and placement. Contrast — differences in color, size, or weight — makes elements distinct so people can scan a screen quickly instead of reading every word.',
            },
            {
              heading: 'Alignment, proximity, and whitespace',
              body: 'Alignment creates a sense of order, and proximity groups related items so their relationship is obvious at a glance. The most underrated tool is whitespace: the empty space around elements is not wasted, because it gives content room to breathe and makes an interface feel calm and premium.',
            },
          ],
          keyPoints: [
            'Hierarchy directs attention to what matters most.',
            'Contrast makes a screen scannable.',
            'Alignment and proximity create order and grouping.',
            'Whitespace is an active design tool, not empty space.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Making everything bold or large, so nothing stands out.',
            'Cramming elements together just to fill space.',
            'Centering long blocks of text, which hurts readability.',
          ],
          practice:
            'Take a cluttered screen you know and redraw it on paper, using size and spacing to make one element clearly the most important.',
          needsVideo: true,
          videoQuery: 'visual design principles for beginners tutorial',
          video: vid(
            'iQl8JLMzFBM',
            'The CORE Design Principles EVERY Designer must Know',
            'Gareth David Studio',
            720,
            300_000,
          ),
        },
        {
          title: 'Color Theory for Interfaces',
          objective: 'Build a usable, accessible color palette for a product.',
          intro:
            'Color sets the mood of a product and directs attention, but it is easy to overdo. A simple, disciplined system beats a rainbow every time.',
          sections: [
            {
              heading: 'Building a palette',
              body: 'A reliable structure is one primary brand color, a range of neutral grays for text and backgrounds, and one or two accent colors for actions and alerts. Limiting your palette keeps the interface coherent and makes important things like buttons stand out, because they are not competing with ten other colors.',
            },
            {
              heading: 'Color with meaning and contrast',
              body: 'Color also communicates: green for success, red for danger, yellow for warning. But never rely on color alone, since some people cannot distinguish certain colors. And always check that text has enough contrast against its background so it stays readable for everyone.',
            },
          ],
          keyPoints: [
            'Use one primary color, neutral grays, and limited accents.',
            'Color carries meaning: success, warning, danger.',
            'Never rely on color alone to convey information.',
            'Keep strong text-to-background contrast.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Using too many bright colors that compete for attention.',
            'Light gray text on white that fails contrast checks.',
            'Relying only on color, like red versus green, to signal state.',
          ],
          practice:
            'Pick one brand color you like, then choose a set of grays and a single accent that work with it. Sketch a button in its normal and hover states.',
          needsVideo: true,
          videoQuery: 'color theory for UI design tutorial',
          video: vid(
            'GyVMoejbGFg',
            'Super Practical Guide to Color Theory, Color Models and Perfect Color Palettes | UI Design',
            'Elizabeth Alli - DesignerUp',
            1500,
            600_000,
          ),
        },
      ],
      quiz: [
        {
          question: 'Which statement best captures the difference between UX and UI?',
          options: [
            'UX is how it works; UI is how it looks',
            'UX is the colors; UI is the research',
            'They mean exactly the same thing',
            'UI is the journey; UX is the buttons',
          ],
          answerIndex: 0,
          explanation: 'UX is about the experience and flow; UI is the visual and interactive layer.',
        },
        {
          question: 'What is the main purpose of visual hierarchy?',
          options: [
            'Guide the eye to the most important element first',
            'Add as many colors as possible',
            'Fill up empty space on the screen',
            'Make every element the same size',
          ],
          answerIndex: 0,
          explanation: 'Hierarchy uses size, weight, and placement to direct attention to what matters most.',
        },
        {
          question: 'What does a reliable interface color palette usually look like?',
          options: [
            'One primary color, neutral grays, and one or two accents',
            'As many bright colors as possible',
            'A different color for every button',
            'Only pure black and white',
          ],
          answerIndex: 0,
          explanation: 'A limited palette keeps the interface coherent and lets key actions stand out.',
        },
        {
          question: 'Why should you never rely on color alone to convey meaning?',
          options: [
            'Some people cannot distinguish certain colors',
            'Color makes apps load slowly',
            'Screens come in different sizes',
            'Color is expensive to use',
          ],
          answerIndex: 0,
          explanation: 'Color-blind users may miss color-only cues, so pair color with text or icons.',
        },
      ],
    },
    {
      title: 'The Design Process',
      summary: 'How real designers move from a problem to a tested solution.',
      lessons: [
        {
          title: 'Understanding Your Users',
          objective: 'Use lightweight research to design for real needs instead of guesses.',
          intro:
            'Good design starts with understanding the people you are designing for. A little research prevents a lot of wasted effort.',
          sections: [
            {
              heading: 'Talk to people early',
              body: 'Before sketching screens, have a few short conversations with real or potential users about their goals and frustrations. You are not asking them to design the product; you are listening for the problems they actually have. Even five conversations reveal patterns you would never guess from your desk.',
            },
            {
              heading: 'Capture what you learn',
              body: 'Summarize your findings in simple tools: a persona that describes a typical user and their goals, or a problem statement that frames exactly what you are solving and for whom. These keep every later decision anchored to a real need instead of personal opinion.',
            },
          ],
          keyPoints: [
            'Research before designing — talk to actual users.',
            'Listen for problems, not feature requests.',
            'A few interviews surface clear patterns.',
            'Personas and problem statements keep you grounded.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Skipping research and designing from assumptions.',
            'Asking leading questions that confirm what you hoped to hear.',
            'Treating one loud opinion as the whole user base.',
          ],
          practice:
            'Write a one-sentence problem statement in the form: I am helping a certain person to do something so they can reach an outcome.',
          needsVideo: true,
          videoQuery: 'user research basics for UX design tutorial',
          video: vid(
            'TRaNiRZqXwY',
            'Step-by-step user research guide I use at Google as a UX designer',
            'Justeen15',
            720,
            150_000,
          ),
        },
        {
          title: 'From Idea to Wireframe',
          objective: 'Turn a concept into low-fidelity layouts before adding visual polish.',
          intro:
            'A wireframe is a deliberately rough sketch of a screen — boxes and labels, no color or styling. Working rough on purpose is a feature, not a limitation.',
          sections: [
            {
              heading: 'Why low fidelity wins',
              body: 'Because wireframes look unfinished, people give honest feedback about structure and flow instead of fixating on colors. They are fast and cheap to change, so you can explore five layouts in the time a polished mockup would take to build one.',
            },
            {
              heading: 'Increasing fidelity',
              body: 'Once a wireframe captures the right structure, you gradually raise the fidelity, adding real content, spacing, and finally visual design. Solving the layout and flow first, and the looks second, saves an enormous amount of rework later.',
            },
          ],
          keyPoints: [
            'Wireframes are rough layouts: structure before style.',
            'Low fidelity invites honest feedback and fast iteration.',
            'Explore several layouts before committing.',
            'Raise fidelity only once the structure is right.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Jumping straight to high-fidelity visuals.',
            'Falling in love with the first layout you try.',
            'Adding color and images that distract from structural feedback.',
          ],
          practice:
            'Sketch two different wireframe layouts for the same screen on paper, then decide which flow is clearer.',
          needsVideo: true,
          videoQuery: 'wireframing tutorial for beginners',
          video: vid(
            'qpH7-KFWZRI',
            'How To Create Your First Wireframe (A UX Tutorial)',
            'CareerFoundry',
            600,
            120_000,
          ),
        },
        {
          title: 'Prototyping in Figma',
          objective: 'Connect screens into a clickable prototype you can test.',
          intro:
            'Figma is the industry-standard design tool, and it runs right in your browser. It is where most modern interface design and prototyping happens.',
          sections: [
            {
              heading: 'Designing on the canvas',
              body: 'In Figma you lay out screens on an infinite canvas using frames, shapes, text, and reusable components. Because elements can be turned into components and reused, changing one updates them everywhere — a huge time saver as your design grows.',
            },
            {
              heading: 'Linking screens into a prototype',
              body: "Figma's prototype mode lets you connect screens with interactions, creating a clickable version of your product that feels real without any code. You can then put it in front of users and watch where they hesitate, which is the cheapest and most valuable feedback you will ever get.",
            },
          ],
          keyPoints: [
            'Figma is free, browser-based, and the industry standard.',
            'Components let you reuse and update elements everywhere.',
            'Prototype mode links screens into a clickable flow.',
            'Testing a prototype early catches problems before they are expensive.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Designing every screen before testing any of them.',
            'Not using components, so changes mean tedious manual edits.',
            'Confusing a static mockup with an interactive prototype.',
          ],
          practice:
            'In Figma, design two screens — a list and a detail view — and link a button on the first to open the second.',
          needsVideo: true,
          videoQuery: 'figma prototyping tutorial for beginners',
          video: vid(
            'jQ1sfKIl50E',
            'Figma Tutorial for Beginners (13-min crash course!)',
            'Flux Academy',
            800,
            1_500_000,
          ),
        },
      ],
      quiz: [
        {
          question: 'Why talk to real users before you start designing screens?',
          options: [
            'To understand their real problems instead of guessing',
            'To ask them to design the product for you',
            'To sell them the product early',
            'So you can skip wireframing entirely',
          ],
          answerIndex: 0,
          explanation: 'Early conversations reveal real needs and patterns you cannot guess from your desk.',
        },
        {
          question: 'What is the advantage of low-fidelity wireframes?',
          options: [
            'They invite honest feedback on structure and are fast to change',
            'They already include final colors and styling',
            'They look completely finished',
            'They require writing code first',
          ],
          answerIndex: 0,
          explanation: 'Because they look rough, people critique flow and structure rather than visuals.',
        },
        {
          question: 'In Figma, what do components let you do?',
          options: [
            'Reuse an element and update every instance at once',
            'Write the app’s backend code',
            'Host the finished website',
            'Run automated user interviews',
          ],
          answerIndex: 0,
          explanation: 'Turning elements into components means one change updates them everywhere.',
        },
        {
          question: "What does Figma's prototype mode produce?",
          options: [
            'A clickable version of the product without any code',
            'Production-ready source code',
            'A connected database',
            'A static PDF only',
          ],
          answerIndex: 0,
          explanation: 'Prototype mode links screens into an interactive flow you can test with users.',
        },
      ],
    },
    {
      title: 'Craft and Polish',
      summary: 'The finishing skills that make work look professional.',
      lessons: [
        {
          title: 'Typography That Works',
          objective: 'Choose and pair fonts that are readable and set a clear hierarchy.',
          intro:
            'Typography is most of what users actually read, so getting it right has an outsized effect on how polished your work feels.',
          sections: [
            {
              heading: 'Choosing typefaces',
              body: 'You rarely need more than one or two typefaces. A single versatile font in a few weights — regular, medium, bold — can carry an entire interface. If you do pair fonts, pick ones with clearly different roles, like a distinctive heading font with a neutral, highly readable body font.',
            },
            {
              heading: 'Setting a type scale',
              body: 'Define a clear scale of sizes so headings, subheadings, and body text are obviously different. Pay attention to line length, since roughly 45 to 75 characters reads best, and to line spacing, which gives text room to breathe. When in doubt, larger and simpler usually wins.',
            },
          ],
          keyPoints: [
            'One or two well-chosen typefaces are usually enough.',
            'Use a clear size scale to signal hierarchy.',
            'Keep line length around 45 to 75 characters.',
            'Generous line spacing improves readability.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Using too many fonts, which looks chaotic.',
            'Body text that is too small or too tightly spaced.',
            'Lines of text that stretch too wide to read comfortably.',
          ],
          practice:
            'Pick one font and lay out a simple article with a title, subtitle, and body, using only size and weight for hierarchy.',
          needsVideo: true,
          videoQuery: 'typography in UI design tutorial',
          video: vid(
            'uboGmQN21-8',
            'Typography for beginners (UI Design Tutorial)',
            'GleanUX',
            720,
            90_000,
          ),
        },
        {
          title: 'Designing for Accessibility',
          objective: 'Make designs usable by people with a wide range of abilities.',
          intro:
            'Accessibility means designing so that people with disabilities can use your product — and the improvements almost always help everyone else too.',
          sections: [
            {
              heading: 'Visual accessibility',
              body: 'Ensure sufficient color contrast between text and its background, make tap targets large enough to hit comfortably, and never rely on color alone to convey meaning. These small choices are the difference between a product someone can use and one they cannot.',
            },
            {
              heading: 'Structure and input',
              body: 'Use clear labels on form fields, a logical focus order so keyboard users can navigate, and text alternatives for images so screen readers can describe them. Building these habits in from the start is far easier than retrofitting them, and in many places it is a legal requirement.',
            },
          ],
          keyPoints: [
            'Ensure strong contrast and large enough tap targets.',
            'Never rely on color alone to convey meaning.',
            'Label form fields and provide alt text for images.',
            'Accessible design improves usability for everyone.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Low-contrast text that is hard to read.',
            'Tiny buttons that are difficult to tap.',
            'Images with no text alternative for screen readers.',
          ],
          practice:
            'Run a screen you designed, or any website, through a free color-contrast checker and fix anything that fails.',
          needsVideo: true,
          videoQuery: 'web accessibility for designers tutorial',
          video: vid(
            'WzfYsuCIFpo',
            'No BS Guide to Web Accessibility for Designers / WCAG2.1 & 508',
            'UX Lord',
            900,
            90_000,
          ),
        },
        {
          title: 'Building Your Portfolio',
          objective: 'Present your work so it tells a story and lands opportunities.',
          intro:
            'A portfolio is how the design world evaluates you, and what it rewards is your thinking, not just pretty screens.',
          sections: [
            {
              heading: 'Case studies over screenshots',
              body: 'The strongest portfolios are built from case studies. Each one frames a problem, walks through your process from research to wireframes to final design, and explains the decisions you made and why. That story is what convinces someone you can solve problems, not just decorate them.',
            },
            {
              heading: 'Quality over quantity',
              body: 'Three deep, well-told projects beat ten shallow ones. Show the messy middle — the ideas you rejected and why — because that honesty is exactly what hiring managers look for. End each case study with the outcome or what you learned.',
            },
          ],
          keyPoints: [
            'Present work as case studies, not just final images.',
            'Show your process and the reasoning behind decisions.',
            'Three strong projects beat ten shallow ones.',
            'Explain outcomes and what you learned.',
          ],
          codeExamples: [],
          commonMistakes: [
            'Showing only final visuals with no context.',
            'Including every project instead of your best few.',
            'Hiding the process, which is the most convincing part.',
          ],
          practice:
            'Outline a case study for one project: the problem, your process, and the outcome, in three short paragraphs.',
          needsVideo: false,
          videoQuery: '',
          video: null,
        },
      ],
      quiz: [
        {
          question: 'What is a sensible rule for choosing typefaces in an interface?',
          options: [
            'One or two well-chosen fonts are usually enough',
            'Use at least five different fonts',
            'Never use bold weights',
            'Only serif fonts are allowed',
          ],
          answerIndex: 0,
          explanation: 'A single versatile font in a few weights can carry an entire interface.',
        },
        {
          question: 'Roughly what line length tends to read most comfortably?',
          options: ['About 45 to 75 characters', '5 to 10 characters', '120 or more characters', 'Length never matters'],
          answerIndex: 0,
          explanation: 'Lines of about 45 to 75 characters are easiest to read without losing your place.',
        },
        {
          question: 'Which is a core accessibility practice?',
          options: [
            'Ensure strong contrast between text and its background',
            'Use the smallest possible tap targets',
            'Rely on color alone to signal state',
            'Remove labels from form fields',
          ],
          answerIndex: 0,
          explanation: 'Sufficient contrast keeps text readable for the widest range of people.',
        },
        {
          question: 'What makes a design portfolio genuinely strong?',
          options: [
            'Case studies that show your process and decisions',
            'Only polished final screenshots',
            'As many projects as you can fit',
            'Hiding the reasoning behind your work',
          ],
          answerIndex: 0,
          explanation: 'Hiring managers want to see how you think, not just the finished visuals.',
        },
      ],
    },
  ],
};

export const sampleCourses: EnrichedCourse[] = [python, uiux];
