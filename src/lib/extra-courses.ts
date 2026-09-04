import type { EnrichedCourse } from './course-schema';

/** Additional library courses. Videos validated via YouTube oEmbed. */
export const extraCourses: EnrichedCourse[] = [
  {
    "title": "Digital Photography",
    "subtitle": "Take photos you're proud of, on any camera",
    "description": "This course is for anyone who owns a phone or an entry-level camera and feels stuck on auto mode. You'll learn what your camera is actually doing when it makes a picture, why some of your photos look flat while others sing, and how a few small decisions about light, framing, and focus change everything. There's no jargon you don't need and no expensive gear required. By the end you'll be able to step off auto with confidence, set up a shot on purpose, fix it lightly afterward, and keep shooting often enough that you steadily get better.",
    "level": "Beginner",
    "estimatedHours": 6,
    "prerequisites": [
      "A smartphone camera or any entry-level camera you can shoot with",
      "Curiosity and a willingness to take a lot of photos, including bad ones",
      "No prior photography knowledge needed"
    ],
    "outcomes": [
      "Understand the exposure triangle and how aperture, shutter speed, and ISO each shape a photo",
      "Read the light in a scene and use it instead of fighting it",
      "Compose stronger frames using thirds, leading lines, framing, and a clean background",
      "Get reliably sharp, well-focused photos and know why a shot came out blurry",
      "Make simple, tasteful edits that improve a photo without ruining it",
      "Build a sustainable shooting habit that keeps you improving over time"
    ],
    "modules": [
      {
        "title": "How a Camera Sees",
        "summary": "Light, and the three controls that turn it into a photo: aperture, shutter speed, and ISO.",
        "lessons": [
          {
            "title": "Light Is the Whole Game",
            "objective": "Learn to notice the light in a scene before you shoot and use its direction and quality to your advantage.",
            "intro": "Before you touch a single setting, the most important thing to understand is that photography is really just collecting light. The camera doesn't see your subject the way you do; it only records the light bouncing off it. So the quality and direction of that light decides almost everything about how your photo feels.\n\nOnce you start noticing light, you can't stop. You'll see why a friend looks great near a window and washed out under the kitchen ceiling light, and you'll start moving people and yourself to chase the good stuff.",
            "sections": [
              {
                "heading": "Soft light versus hard light",
                "body": "Soft light comes from a large or diffused source, like an overcast sky or a big window, and it wraps gently around your subject with soft-edged shadows. Hard light comes from a small, bright source like the noon sun and creates sharp, dark shadows and squinting eyes. If you photograph a friend outside at midday they'll have raccoon shadows under their eyes, but move them into the open shade of a building wall and that same face suddenly looks even and flattering."
              },
              {
                "heading": "The direction light comes from",
                "body": "Light hitting your subject from the front flattens everything and hides texture, while light coming from the side rakes across surfaces and reveals shape and depth. Try photographing a textured object like a slice of bread or a brick wall first with the sun behind you, then with the sun off to one side, and you'll see the side-lit version look three-dimensional while the front-lit one looks like a sticker."
              },
              {
                "heading": "The golden hour gift",
                "body": "For about an hour after sunrise and before sunset, the sun sits low and its light turns warm, soft, and directional all at once, which is why so many beautiful photos happen then. You don't need to understand any settings to benefit; simply taking the exact same street or portrait at 6pm instead of noon will often double how good it looks."
              }
            ],
            "keyPoints": [
              "The camera records light, not objects, so light quality drives the whole image",
              "Soft, diffused light flatters faces; hard midday sun creates harsh shadows",
              "Side light reveals texture and depth; front light flattens it",
              "Golden hour near sunrise and sunset is the easiest beautiful light to find",
              "Moving your subject a few feet into better light beats any setting change"
            ],
            "commonMistakes": [
              "Believing bright sunny noon is the best time to shoot, when it's usually the harshest",
              "Putting the sun behind yourself so it blasts your subject flat in the face",
              "Thinking a better camera fixes bad light, when repositioning for good light matters far more",
              "Shooting indoors next to a dim ceiling lamp instead of moving toward a window"
            ],
            "practice": "Pick one person or object and photograph it three times without changing any settings: once in harsh direct sun, once in open shade, and once near a large window or during golden hour. Compare the three and write one sentence about which light you liked best and why.",
            "needsVideo": true,
            "videoQuery": "Light Is the Whole Game tutorial",
            "video": {
              "id": "spWdc9ItHCY",
              "title": "Understanding QUALITY of light in Photography",
              "channel": "Omar Gonzalez Photography",
              "url": "https://www.youtube.com/watch?v=spWdc9ItHCY",
              "embedUrl": "https://www.youtube.com/embed/spWdc9ItHCY",
              "thumbnail": "https://i.ytimg.com/vi/spWdc9ItHCY/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          },
          {
            "title": "Aperture: How Wide the Eye Opens",
            "objective": "Understand what aperture does to brightness and background blur, and when to open it wide or stop it down.",
            "intro": "Aperture is the size of the opening inside your lens that lets light in, and it's measured in f-numbers like f/2.8 or f/11. The confusing part is that small numbers mean a big opening and big numbers mean a small opening, which feels backwards until it clicks.\n\nAperture does two jobs at once: it controls how much light reaches the sensor, and it controls how much of your scene is in sharp focus. That second job is the one that makes photos look professional.",
            "sections": [
              {
                "heading": "Wide open for a blurry background",
                "body": "A wide aperture like f/1.8 or f/2.8 lets in lots of light and keeps only a thin slice of the scene sharp, which throws the background into creamy blur. This is exactly the look you want for a portrait: shoot a person at f/2 with a messy room behind them and the clutter melts into soft color while their face stays crisp. On many phones this same effect is offered as Portrait mode."
              },
              {
                "heading": "Stopped down for everything sharp",
                "body": "A narrow aperture like f/8 or f/11 keeps much more of the scene in focus from front to back, which is what you want for landscapes or group photos. If you photograph a mountain valley at f/2.8 the far peaks go soft, but at f/11 the foreground flowers and the distant ridge are both sharp."
              },
              {
                "heading": "The tradeoff to remember",
                "body": "Because a narrow aperture lets in less light, the camera has to compensate elsewhere, usually with a slower shutter or higher ISO. So choosing f/11 for a sweeping landscape at dusk may force a long exposure, which is why aperture is never a free choice but always part of a balancing act you'll master in the next lesson."
              }
            ],
            "keyPoints": [
              "Aperture is the lens opening, measured in f-numbers",
              "Small f-number means wide opening, more light, and a blurry background",
              "Large f-number means small opening, less light, and more of the scene in focus",
              "Wide apertures suit portraits; narrow apertures suit landscapes and groups",
              "Changing aperture forces the camera to adjust shutter or ISO to keep brightness right"
            ],
            "commonMistakes": [
              "Assuming a bigger f-number is a wider opening, when it's the opposite",
              "Shooting a group photo at f/1.8 and finding half the faces out of focus",
              "Believing background blur comes from the camera body, when aperture and distance create it",
              "Thinking you must always shoot wide open, when landscapes need a narrow aperture"
            ],
            "practice": "Photograph the same subject, ideally a person or a single object on a table, twice: once at the widest aperture your camera or phone allows (or Portrait mode) and once at a narrow one like f/8 or with Portrait mode off. Notice how the background changes from blurry to sharp.",
            "needsVideo": true,
            "videoQuery": "Aperture: How Wide the Eye Opens tutorial",
            "video": {
              "id": "YojL7UQTVhc",
              "title": "Camera Basics - Aperture",
              "channel": "Apalapse",
              "url": "https://www.youtube.com/watch?v=YojL7UQTVhc",
              "embedUrl": "https://www.youtube.com/embed/YojL7UQTVhc",
              "thumbnail": "https://i.ytimg.com/vi/YojL7UQTVhc/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          },
          {
            "title": "Shutter Speed, ISO, and the Triangle",
            "objective": "Learn how shutter speed and ISO work, then balance all three controls as one connected exposure system.",
            "intro": "Shutter speed is how long the camera's sensor is exposed to light, and ISO is how sensitive the camera is to that light. Together with aperture, they form the exposure triangle, the single idea that unlocks shooting off auto.\n\nThe whole point of the triangle is that these three controls work together. Change one and you usually have to change another to keep the brightness right, and once that clicks you can make a photo look exactly the way you intend.",
            "sections": [
              {
                "heading": "Shutter speed freezes or blurs motion",
                "body": "A fast shutter like 1/1000 of a second captures a tiny sliver of time and freezes fast subjects sharply, while a slow shutter like 1/4 of a second records movement as streaks. Catching a child mid-jump cleanly needs around 1/1000, but resting the camera on a wall and shooting a river at a slow speed turns the water silky. Handheld, keep the shutter at 1/125 or faster, because anything slower risks blur from your own shaky hands."
              },
              {
                "heading": "ISO brightens, but adds grain",
                "body": "Raising ISO amplifies the light signal so you can shoot in dim places without a flash, but that amplification also boosts noise, making the photo look grainy. Shooting a dim restaurant at ISO 6400 lets you avoid blur, but the same scene at ISO 100 would be cleaner if only you could let in enough light another way, so keep ISO as low as the scene allows."
              },
              {
                "heading": "Balancing the triangle",
                "body": "Picture a budget for light that aperture, shutter, and ISO each spend or save: open the aperture and you gain light, so you can use a faster shutter or lower ISO. A reliable habit is to decide your priority first, then balance the rest around it. For a portrait, choose a wide aperture, set a shutter fast enough to avoid shake, and raise ISO only as much as needed to make the brightness correct."
              }
            ],
            "keyPoints": [
              "Fast shutter freezes motion; slow shutter records it as blur; keep handheld at 1/125 or faster",
              "ISO controls sensitivity: low is clean, high is brighter but grainier",
              "The exposure triangle means changing one setting requires adjusting another",
              "Aperture, shutter, and ISO together set both brightness and the look of a photo",
              "Decide your priority setting first, then balance the other two around it"
            ],
            "commonMistakes": [
              "Trying to shoot silky water blur while holding the camera by hand",
              "Leaving ISO cranked high in good light and getting needlessly grainy photos",
              "Treating the three settings as independent instead of one connected light budget",
              "Avoiding high ISO so strictly that you get a blurry shot instead of a slightly grainy sharp one"
            ],
            "practice": "In a dim room, take the same photo two ways: once forcing a fast shutter (notice it comes out dark) and once allowing a slower shutter or higher ISO until it's bright enough. Notice how brightening one way costs you something another way, which is the triangle in action.",
            "needsVideo": true,
            "videoQuery": "Shutter Speed, ISO, and the Triangle tutorial",
            "video": {
              "id": "4vuPrDdTzSY",
              "title": "Master the Exposure Triangle in 15 Minutes: Shutter Speed, ISO, & Aperture Explained",
              "channel": "John Gress",
              "url": "https://www.youtube.com/watch?v=4vuPrDdTzSY",
              "embedUrl": "https://www.youtube.com/embed/4vuPrDdTzSY",
              "thumbnail": "https://i.ytimg.com/vi/4vuPrDdTzSY/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          }
        ],
        "quiz": [
          {
            "question": "In aperture f-numbers, which setting creates the most blurred background?",
            "options": [
              "f/16",
              "f/11",
              "f/8",
              "f/1.8"
            ],
            "answerIndex": 3,
            "explanation": "A small f-number like f/1.8 is the widest opening, which keeps only a thin slice in focus and blurs the background most."
          },
          {
            "question": "You're photographing a child running and the shot keeps coming out blurry. What's the best fix?",
            "options": [
              "Use a faster shutter speed like 1/1000",
              "Lower the ISO to 100",
              "Use a narrower aperture like f/16",
              "Switch the light source to side lighting"
            ],
            "answerIndex": 0,
            "explanation": "A fast shutter speed freezes fast motion, capturing the running child sharply instead of smeared across the frame."
          },
          {
            "question": "What happens when you raise ISO to a high value like 6400?",
            "options": [
              "The lens opening physically gets wider",
              "The image gets brighter but adds grainy noise",
              "The shutter automatically gets faster with no other effect",
              "The background blur increases"
            ],
            "answerIndex": 1,
            "explanation": "Higher ISO amplifies the light signal so dim scenes look brighter, but that amplification also introduces grainy noise."
          },
          {
            "question": "Which light is generally the easiest to make a flattering portrait in?",
            "options": [
              "Direct overhead sun at noon",
              "Open shade or golden hour light",
              "A single dim ceiling bulb",
              "Light coming straight from behind the camera"
            ],
            "answerIndex": 1,
            "explanation": "Open shade and golden hour provide soft, even, directional light that flatters faces, unlike harsh noon sun or flat front light."
          }
        ]
      },
      {
        "title": "Composition That Works",
        "summary": "Where to place things in the frame so a photo feels intentional: thirds, leading lines, framing, and clean backgrounds.",
        "lessons": [
          {
            "title": "The Rule of Thirds",
            "objective": "Learn to place key subjects off-center using a thirds grid to make photos feel balanced and dynamic.",
            "intro": "Most beginners plant their subject dead center, and the result usually feels static and a little dull. The rule of thirds is a simple fix: imagine your frame divided by two horizontal and two vertical lines into nine equal boxes, like a tic-tac-toe grid.\n\nPlacing your subject along those lines or where they cross tends to feel more natural and alive to the eye. It's not an unbreakable law, but it's the fastest way to make an ordinary snapshot look composed on purpose.",
            "sections": [
              {
                "heading": "Turn on the grid",
                "body": "Nearly every phone and camera can overlay a thirds grid in its settings, and turning it on trains your eye fast. Once those lines are on your screen, you'll instinctively start nudging the camera so your subject lands on a line instead of floating in the dead center."
              },
              {
                "heading": "Put the subject on a power point",
                "body": "The four spots where the grid lines cross are called power points, and placing your main subject there draws the eye naturally. If you're shooting a single tree in a field, put the tree on the right vertical line rather than smack in the middle, and the image immediately feels more intentional and gives the tree room to breathe."
              },
              {
                "heading": "Place horizons on a line, not the middle",
                "body": "For landscapes, resting the horizon on the lower third emphasizes a dramatic sky, while placing it on the upper third emphasizes the foreground. A sunset photo with the horizon cutting the frame exactly in half feels split and tense, but drop the horizon to the lower third and the glowing sky gets the space it deserves."
              }
            ],
            "keyPoints": [
              "Divide the frame into a three-by-three grid in your mind or on screen",
              "Place key subjects along the lines or at the four crossing points",
              "Off-center placement usually feels more dynamic than dead center",
              "Put horizons on the upper or lower third, not the middle",
              "The rule is a strong default, not a law you can never break"
            ],
            "commonMistakes": [
              "Always centering the subject out of habit, making photos feel static",
              "Splitting a landscape with the horizon exactly in the middle",
              "Thinking the rule of thirds is mandatory rather than a flexible guideline",
              "Leaving the subject so far toward an edge it feels cramped instead of balanced"
            ],
            "practice": "Turn on your camera's grid and shoot five photos where you deliberately place the main subject on a line or at a crossing point rather than the center. Pick the one you like most and notice how the off-center placement changes the feel.",
            "needsVideo": true,
            "videoQuery": "The Rule of Thirds tutorial",
            "video": {
              "id": "FBHw5dVf5VA",
              "title": "A Photographer’s Guide to the Rule of Thirds | Adobe Photography Basics",
              "channel": "Adobe Asia Pacific",
              "url": "https://www.youtube.com/watch?v=FBHw5dVf5VA",
              "embedUrl": "https://www.youtube.com/embed/FBHw5dVf5VA",
              "thumbnail": "https://i.ytimg.com/vi/FBHw5dVf5VA/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          },
          {
            "title": "Leading Lines and Depth",
            "objective": "Use natural lines in a scene to guide the viewer's eye and create a sense of depth.",
            "intro": "A flat photo gives the eye nowhere to go, while a strong one pulls you in and walks you through it. Leading lines are any lines in the scene, such as roads, fences, shadows, or rivers, that guide the viewer's gaze toward your subject.\n\nUsing them is one of the most satisfying composition tricks because the lines are already out there in the world. Your job is just to position yourself so they point where you want the eye to land.",
            "sections": [
              {
                "heading": "Find the lines that already exist",
                "body": "Roads, railway tracks, fences, staircases, shorelines, and even rows of streetlights all act as natural arrows. Stand at the start of a path winding toward a distant mountain and the path itself drags the viewer's eye from the foreground all the way to the peak, making the photo feel like a journey."
              },
              {
                "heading": "Point lines at your subject",
                "body": "A leading line works best when it actually ends at something worth looking at. If a fence line just runs off the edge to nowhere it feels aimless, but angle yourself so that same fence runs toward a lone barn and now the line has a purpose and a payoff."
              },
              {
                "heading": "Build depth with foreground and background",
                "body": "Depth comes from having something near, something mid-distance, and something far in the same frame. Crouch so a few flowers fill the foreground while a lake sits in the middle and hills rise behind, and the eye travels through all three layers, making a two-dimensional photo feel like a space you could step into."
              }
            ],
            "keyPoints": [
              "Leading lines are real features like roads, fences, or shadows that guide the eye",
              "Position yourself so lines point toward your main subject",
              "Lines that lead to nothing feel aimless; give them a destination",
              "Layering foreground, middle, and background creates a sense of depth",
              "Lowering your viewpoint often strengthens foreground and depth"
            ],
            "commonMistakes": [
              "Ignoring obvious lines in a scene and shooting from a flat, head-on angle",
              "Letting leading lines point off the edge toward nothing meaningful",
              "Forgetting the foreground, so landscapes look empty and depthless",
              "Thinking depth needs a special lens, when viewpoint and layering create it"
            ],
            "practice": "Go find one obvious leading line near you, such as a path, staircase, fence, or row of poles, and shoot it so the line clearly guides the eye toward a subject at its end. Then take one landscape or street photo that includes something close, something mid-distance, and something far.",
            "needsVideo": true,
            "videoQuery": "Leading Lines and Depth tutorial",
            "video": {
              "id": "qabSz8YREW0",
              "title": "Leading Lines Photography: The BEGINNER'S Guide + Tutorial",
              "channel": "Nate Torres",
              "url": "https://www.youtube.com/watch?v=qabSz8YREW0",
              "embedUrl": "https://www.youtube.com/embed/qabSz8YREW0",
              "thumbnail": "https://i.ytimg.com/vi/qabSz8YREW0/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          },
          {
            "title": "Framing and a Clean Background",
            "objective": "Use natural frames to focus attention and keep backgrounds clean so the subject stands out.",
            "intro": "Two simple moves separate a cluttered snapshot from a clear photograph: framing your subject and controlling what's behind it. Both are about directing attention, telling the viewer exactly what matters.\n\nThe good news is that neither requires gear. They just require you to look around the edges of your frame and at the background for a half-second before you press the shutter, which is a habit most beginners skip entirely.",
            "sections": [
              {
                "heading": "Frame within the frame",
                "body": "Using an element in the scene to surround your subject, like a doorway, an archway, overhanging branches, or a window, focuses attention and adds depth. Shooting a person through a doorway so the dark frame of the door surrounds them instantly draws the eye to them and makes the photo feel composed rather than accidental."
              },
              {
                "heading": "Watch the background before you shoot",
                "body": "A busy or distracting background steals attention from your subject, and the most common offender is something growing out of a person's head. Before you press the shutter, glance behind your subject; if there's a pole or tree appearing to sprout from their skull, take one step to the side and the background cleans up instantly."
              },
              {
                "heading": "Simplify by moving, not zooming",
                "body": "The simplest backgrounds are often plain ones like a wall, the sky, or open grass, and you reach them by moving rather than by fixing things later. If your subject stands in front of a chaotic street, walk them a few steps until a clean wall or open sky sits behind them, and suddenly they pop without any editing at all."
              }
            ],
            "keyPoints": [
              "Natural frames like doorways and branches focus attention on the subject",
              "Always scan the background before pressing the shutter",
              "Watch for poles or trees appearing to grow out of a person's head",
              "A plain background like a wall or sky makes a subject stand out",
              "Move your feet to fix a background instead of fixing it in editing"
            ],
            "commonMistakes": [
              "Ignoring the background entirely and getting distracting clutter behind the subject",
              "Letting objects appear to sprout from a subject's head",
              "Believing a messy background can always be fixed later in editing",
              "Zooming in to crop out clutter instead of repositioning for a cleaner backdrop"
            ],
            "practice": "Photograph one person or object twice: first against the busiest background you can find, then move yourself or them so a clean, simple background sits behind. For a bonus, find a doorway, window, or branches to frame the subject within the scene.",
            "needsVideo": true,
            "videoQuery": "Framing and a Clean Background tutorial",
            "video": {
              "id": "291TLSXhYns",
              "title": "Framing and Composition Tutorial: Quick and Easy!",
              "channel": "Patricia Kelikani",
              "url": "https://www.youtube.com/watch?v=291TLSXhYns",
              "embedUrl": "https://www.youtube.com/embed/291TLSXhYns",
              "thumbnail": "https://i.ytimg.com/vi/291TLSXhYns/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          }
        ],
        "quiz": [
          {
            "question": "According to the rule of thirds, where should a single tree usually go in the frame?",
            "options": [
              "Dead center for balance",
              "On a vertical third line or crossing point",
              "As far into a corner as possible",
              "Cut in half by the frame edge"
            ],
            "answerIndex": 1,
            "explanation": "Placing the subject on a third line or power point feels more dynamic and intentional than centering it."
          },
          {
            "question": "What makes a leading line most effective in a photo?",
            "options": [
              "It runs off the edge toward nothing",
              "It is perfectly horizontal",
              "It guides the eye toward a meaningful subject",
              "It is always a straight road"
            ],
            "answerIndex": 2,
            "explanation": "A leading line works best when it directs the viewer's gaze toward a subject worth looking at, giving the line purpose."
          },
          {
            "question": "You notice a lamppost appears to grow out of your subject's head. What's the best fix?",
            "options": [
              "Take a step to the side to change the background",
              "Raise the ISO",
              "Use a faster shutter speed",
              "Center the subject in the frame"
            ],
            "answerIndex": 0,
            "explanation": "Moving slightly repositions the distracting background element, cleaning up the shot before you take it."
          },
          {
            "question": "How do you best create a sense of depth in a landscape?",
            "options": [
              "Shoot flat and head-on",
              "Include foreground, middle ground, and background layers",
              "Use the highest ISO possible",
              "Keep the horizon exactly centered"
            ],
            "answerIndex": 1,
            "explanation": "Layering something near, mid-distance, and far lets the eye travel through the scene, creating depth."
          }
        ]
      },
      {
        "title": "From Snapshot to Photograph",
        "summary": "The finishing skills: nailing focus and sharpness, editing with a light touch, and building a habit that keeps you improving.",
        "lessons": [
          {
            "title": "Focus and Sharpness",
            "objective": "Get consistently sharp photos by controlling focus, holding the camera steady, and diagnosing blur.",
            "intro": "Nothing ruins a great composition faster than a subject that turns out soft when you look at it later. Sharpness comes from two things working together: the camera focusing on the right spot, and the camera staying still while the photo is taken.\n\nMost blur has a simple, fixable cause once you can tell the two apart. Learning to diagnose why a shot was soft is what turns occasional luck into reliable results.",
            "sections": [
              {
                "heading": "Tell the camera what to focus on",
                "body": "Cameras and phones don't always guess the right focus point, so tapping or selecting your subject removes the guesswork. When shooting a portrait, tap directly on the nearest eye on your phone screen, and if the camera had focused on the background behind them the image will instantly snap onto the face where it belongs."
              },
              {
                "heading": "Hold steady and breathe",
                "body": "Camera shake is a leading cause of soft photos, especially in low light. Tuck your elbows against your ribs, exhale slowly as you gently press the shutter rather than jabbing it, and lean against a wall or set the camera on a table when light is dim, and you'll eliminate most of the soft handheld shots you used to get."
              },
              {
                "heading": "Diagnose why a shot is blurry",
                "body": "When a photo is soft, ask whether the whole frame is blurry or only the subject. If everything is uniformly soft it was usually camera shake or a slow shutter, but if the background is sharp and the subject is soft, the camera simply focused on the wrong place, and tapping your subject next time fixes it."
              }
            ],
            "keyPoints": [
              "Tap or select your subject so the camera focuses on the right spot",
              "For people, focus on the nearest eye",
              "Brace your body and exhale gently when pressing the shutter",
              "Use a wall, table, or tripod in dim light to prevent shake",
              "Whole-frame blur means shake; subject-only blur means missed focus"
            ],
            "commonMistakes": [
              "Letting the camera auto-pick focus and getting the background sharp instead of the subject",
              "Jabbing the shutter button hard enough to shake the camera",
              "Assuming all blur is the same problem with the same fix",
              "Shooting handheld in dark rooms without bracing and wondering why shots are soft"
            ],
            "practice": "Take a portrait of a person or pet where you deliberately tap to focus on their eye, then take another letting the camera choose. Compare which nailed the focus, and for any blurry shot you have, decide whether it was camera shake or missed focus.",
            "needsVideo": true,
            "videoQuery": "Focus and Sharpness tutorial",
            "video": {
              "id": "eccXHm_ORnc",
              "title": "How To Take Sharp Photos EVERY Time With Any Camera",
              "channel": "Pat Kay",
              "url": "https://www.youtube.com/watch?v=eccXHm_ORnc",
              "embedUrl": "https://www.youtube.com/embed/eccXHm_ORnc",
              "thumbnail": "https://i.ytimg.com/vi/eccXHm_ORnc/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          },
          {
            "title": "Simple Editing With a Light Touch",
            "objective": "Improve photos with a few basic, tasteful adjustments while avoiding the over-editing trap.",
            "intro": "Editing isn't cheating, and it isn't about faking a scene; it's the digital version of what darkrooms always did. A few small adjustments can take a photo from almost-there to genuinely good, often in under a minute on a free phone app.\n\nThe key is restraint. The goal is a photo that looks like a slightly better version of reality, not a cranked, over-saturated cartoon that screams it was edited.",
            "sections": [
              {
                "heading": "Start with exposure and contrast",
                "body": "The first sliders worth touching are exposure, which makes the photo brighter or darker overall, and contrast, which deepens the difference between lights and darks. If a photo looks dull and flat, nudging contrast up a little and lifting exposure slightly often gives it life, like wiping a foggy window clean."
              },
              {
                "heading": "Then straighten and crop",
                "body": "A tilted horizon is one of the most distracting flaws and one of the easiest to fix with the straighten tool. Crop to tighten your composition too, perhaps trimming distracting edges or repositioning your subject onto a thirds line you missed in the moment, which is like recomposing the shot after the fact."
              },
              {
                "heading": "Adjust color, gently",
                "body": "Warmth, often labeled temperature, shifts a photo toward orange or blue, and a small warm push can make a portrait feel inviting while a cool push suits a moody scene. Bumping saturation slightly can make colors richer, but the classic beginner mistake is dragging it far right until skin turns orange and skies turn radioactive, so move it just a touch and stop."
              }
            ],
            "keyPoints": [
              "Edit to enhance reality, not to fake or overpower it",
              "Start with exposure and contrast to fix dull, flat photos",
              "Use straighten to fix tilted horizons and crop to improve composition",
              "Adjust warmth and saturation gently for mood and richer color",
              "Restraint is the difference between a good edit and an obvious one"
            ],
            "commonMistakes": [
              "Cranking saturation so high that skin and skies look unnatural",
              "Believing editing is cheating rather than a normal finishing step",
              "Over-sharpening until the photo looks crunchy and harsh",
              "Ignoring a tilted horizon that a one-tap straighten would fix"
            ],
            "practice": "Take one of your existing photos into any free editing app and make only four light adjustments: exposure, contrast, straighten, and a small warmth or saturation nudge. Then look at the before and after side by side and confirm the edit still looks natural.",
            "needsVideo": true,
            "videoQuery": "Simple Editing With a Light Touch tutorial",
            "video": {
              "id": "KR7L2oSRlwY",
              "title": "PHOTO EDITING FOR BEGINNERS – 9 Simple Steps to Improve Your Photos",
              "channel": "Anthony Turnham",
              "url": "https://www.youtube.com/watch?v=KR7L2oSRlwY",
              "embedUrl": "https://www.youtube.com/embed/KR7L2oSRlwY",
              "thumbnail": "https://i.ytimg.com/vi/KR7L2oSRlwY/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          },
          {
            "title": "Building a Photography Habit",
            "objective": "Establish a sustainable practice routine that turns occasional shooting into steady, lasting improvement.",
            "intro": "Everything in this course only sticks if you keep shooting. The single biggest difference between people who improve and people who stay stuck isn't talent or gear; it's how often they actually press the shutter and look at the results.\n\nThe encouraging part is that you carry a capable camera everywhere already. Improvement comes from small, regular practice and honest reflection, not from waiting for a special trip or a better camera.",
            "sections": [
              {
                "heading": "Practice one thing at a time",
                "body": "Trying to remember every lesson at once is overwhelming, so pick a single focus for a week. Spend one week shooting only with the thirds grid in mind, the next week hunting for leading lines, and the next chasing good light, and each skill becomes automatic before you stack the next one on top."
              },
              {
                "heading": "Review your photos honestly",
                "body": "Shooting without reviewing is how people repeat the same mistakes for years. Once a week, look back at your shots and ask which ones you like and exactly why, and which missed and whether it was light, focus, or composition, because naming the reason is what turns a mistake into a lesson you won't repeat."
              },
              {
                "heading": "Make it small and repeatable",
                "body": "A habit survives because it's easy, not because it's ambitious. Commit to something tiny like ten deliberate photos a day on your walk or commute, and that low bar keeps you shooting on busy days, which compounds into thousands of frames and real, visible improvement over a few months."
              }
            ],
            "keyPoints": [
              "Frequent shooting matters more than talent or expensive gear",
              "Focus on practicing one skill at a time rather than all at once",
              "Review your photos weekly and name why each worked or failed",
              "Keep the habit small and repeatable so it survives busy days",
              "The camera you carry everywhere is enough to get good"
            ],
            "commonMistakes": [
              "Waiting for a better camera or a special trip instead of shooting now",
              "Trying to apply every technique at once and feeling overwhelmed",
              "Taking photos but never reviewing them, so the same mistakes repeat",
              "Setting an ambitious daily goal that collapses after a few days"
            ],
            "practice": "Commit to a one-week challenge: take at least ten deliberate photos every day focusing on a single skill from this course, such as the rule of thirds. At the end of the week, review them all and pick your three favorites, writing one sentence on why each works.",
            "needsVideo": true,
            "videoQuery": "Building a Photography Habit tutorial",
            "video": {
              "id": "GDypEOtlF4A",
              "title": "The Little Photography Habit With Unexpectedly Large Results",
              "channel": "ᴀɴᴅʀᴇ",
              "url": "https://www.youtube.com/watch?v=GDypEOtlF4A",
              "embedUrl": "https://www.youtube.com/embed/GDypEOtlF4A",
              "thumbnail": "https://i.ytimg.com/vi/GDypEOtlF4A/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            },
            "codeExamples": []
          }
        ],
        "quiz": [
          {
            "question": "A photo's background is sharp but the subject's face is soft. What most likely went wrong?",
            "options": [
              "The camera shook during the shot",
              "The ISO was too low",
              "The camera focused on the wrong spot",
              "The horizon was tilted"
            ],
            "answerIndex": 2,
            "explanation": "When the background is sharp but the subject isn't, the camera focused in the wrong place; tapping the subject fixes it."
          },
          {
            "question": "What's the most common over-editing mistake beginners make?",
            "options": [
              "Straightening the horizon",
              "Cropping to the rule of thirds",
              "Dragging saturation so high that skin and skies look unnatural",
              "Slightly raising the exposure"
            ],
            "answerIndex": 2,
            "explanation": "Over-cranking saturation makes colors look fake, which is the classic sign of a heavy-handed edit."
          },
          {
            "question": "What is the best way to keep a photography practice habit alive?",
            "options": [
              "Wait until you can afford a professional camera",
              "Keep it small and repeatable, like ten photos a day",
              "Try to master every technique in a single session",
              "Only shoot on special trips"
            ],
            "answerIndex": 1,
            "explanation": "A small, repeatable goal survives busy days and compounds into real improvement over time."
          },
          {
            "question": "Why is reviewing your photos each week so important?",
            "options": [
              "It automatically sharpens blurry shots",
              "It lets you name why shots worked or failed so you stop repeating mistakes",
              "It increases your camera's resolution",
              "It is only useful for professional photographers"
            ],
            "answerIndex": 1,
            "explanation": "Honest review turns mistakes into named lessons, which is how you actually improve instead of repeating errors."
          }
        ]
      }
    ]
  },
  {
    "title": "Negotiation Skills",
    "subtitle": "Get to yes without burning bridges",
    "description": "A practical, all-levels course for professionals who negotiate salaries, deals, and everyday agreements. You will learn how to prepare so you walk in calm and confident, how to listen and trade concessions skillfully at the table, and how to close deals that hold up while keeping the relationship intact. Every lesson uses plain language and concrete examples drawn from real workplace situations, so you can apply the ideas the same day.",
    "level": "All levels",
    "estimatedHours": 5,
    "prerequisites": [
      "No prior negotiation training required",
      "A real or upcoming negotiation you can practice on (a raise, a contract, a shared decision)",
      "Willingness to prepare before important conversations"
    ],
    "outcomes": [
      "Separate what people say they want from what they actually need",
      "Build and improve your BATNA so you negotiate from strength, not fear",
      "Open with a well-judged anchor instead of waiting to be told a number",
      "Listen actively and trade concessions so every give earns you a get",
      "Stay steady when someone uses pressure or hardball tactics",
      "Close agreements that are clear, durable, and leave the relationship healthy"
    ],
    "modules": [
      {
        "title": "Preparation and Mindset",
        "summary": "Do the thinking before the talking: interests, your walk-away alternative, and the first number.",
        "lessons": [
          {
            "title": "Interests vs Positions",
            "objective": "Learn to look past the demand someone states to the underlying need driving it, and use that to find better deals.",
            "intro": "A position is what someone says they want. An interest is why they want it. Most people argue over positions and get stuck, because two positions can clash even when the interests behind them fit together neatly.\n\nWhen you train yourself to ask why, deals open up that neither side could see while they were trading demands. This single habit is the foundation of almost everything else in negotiation.",
            "sections": [
              {
                "heading": "The classic orange",
                "body": "Two people both insist they need the only orange in the kitchen, so they split it in half and each feels shortchanged. Had either asked why, they would have learned one wanted the peel for baking and the other wanted the juice to drink. The positions were identical and in conflict; the interests were completely compatible. Whenever a negotiation feels like a tug of war, that is your signal to stop pulling and start asking what the other person is really trying to achieve."
              },
              {
                "heading": "Digging for the why",
                "body": "You uncover interests by asking open questions and listening for the goal behind the request. If a colleague demands a Friday deadline, the position is Friday but the interest might be looking prepared for a Monday client meeting. Once you know that, you can offer a Thursday draft of just the client-facing parts, which may satisfy them more fully than the original demand ever would."
              },
              {
                "heading": "Naming your own interests",
                "body": "This works in both directions, so before any negotiation write down what you actually need rather than the figure or term you plan to ask for. If you think you want a corner office, the real interest might be quiet focus time, which a noise-cancelling setup or two remote days could satisfy more cheaply. Knowing your own interests keeps you flexible when your first position turns out to be unavailable."
              }
            ],
            "keyPoints": [
              "A position is the stated demand; an interest is the underlying need or fear behind it",
              "Conflicting positions often hide compatible interests",
              "Ask why and why not to surface what really matters to the other side",
              "Knowing your own interests lets you accept creative alternatives to your opening ask"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Treating the first number or demand as the real goal instead of a clue to a deeper need",
              "Assuming the other side's interests are the opposite of yours when they are often simply different",
              "Hiding your own interests so well that the other side cannot find a deal that satisfies you"
            ],
            "practice": "Think of one disagreement you are currently having with a coworker, vendor, or family member. Write down each side's stated position in one line, then write at least two possible interests that could be driving each position. Identify one option that might satisfy both sets of interests at once.",
            "needsVideo": true,
            "videoQuery": "Interests vs Positions tutorial",
            "video": {
              "id": "MuJyDRgONls",
              "title": "Getting to Yes: Interests vs. Positions",
              "channel": "William Ury",
              "url": "https://www.youtube.com/watch?v=MuJyDRgONls",
              "embedUrl": "https://www.youtube.com/embed/MuJyDRgONls",
              "thumbnail": "https://i.ytimg.com/vi/MuJyDRgONls/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Know Your BATNA",
            "objective": "Define your Best Alternative To a Negotiated Agreement and use it as the real measure of any offer.",
            "intro": "Your BATNA is what you will do if this particular negotiation falls through. It is not your goal and not your bottom line; it is your backup plan, and it quietly determines how much power you actually have.\n\nThe person with the stronger walk-away option can stay calm, say no, and wait. Knowing your BATNA before you sit down is the difference between negotiating and merely hoping.",
            "sections": [
              {
                "heading": "What a BATNA really is",
                "body": "Imagine you are weighing a job offer of ninety thousand dollars. Your BATNA is not the number you wish you could get; it is the concrete reality of your situation if you turn this offer down, such as staying in your current role at eighty-five thousand or accepting a competing offer at eighty-eight. You judge the ninety-thousand offer against that real alternative, not against your hopes, which is what stops you from either grabbing a weak deal or rejecting a good one."
              },
              {
                "heading": "Strengthen it before you negotiate",
                "body": "Because your power comes from your alternative, the most useful preparation is often improving it before the conversation rather than rehearsing arguments. Lining up a second job offer, a backup supplier, or another interested buyer changes how you carry yourself far more than any clever phrasing. Even one extra credible option moves you from pleading to choosing."
              },
              {
                "heading": "Estimate theirs too",
                "body": "The other side has a BATNA as well, and guessing it tells you how hard they can push. A landlord with three eager applicants behind you has a strong alternative and little reason to drop the rent, while one staring at a unit that has sat empty for two months will bend. When you sense their alternative is weak, you can hold firm with confidence."
              }
            ],
            "keyPoints": [
              "Your BATNA is your real plan B, not your wish or your bottom line",
              "Compare every offer against your BATNA to decide whether to accept or walk",
              "Improving your alternative before negotiating raises your power more than any tactic",
              "Estimating the other side's BATNA reveals how much pressure they can really apply"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Confusing your BATNA (your alternative) with your reservation price (your worst acceptable deal)",
              "Walking into a negotiation without having developed any real alternative, then bluffing",
              "Overestimating your own BATNA because you have not actually tested whether the alternative exists"
            ],
            "practice": "For a negotiation you expect in the next month, write down in one sentence exactly what you will do if no agreement is reached. Then list one specific action you could take this week to make that alternative stronger, and do it.",
            "needsVideo": true,
            "videoQuery": "Know Your BATNA tutorial",
            "video": {
              "id": "zSdhd3URSdI",
              "title": "What Is a Best Alternative to a Negotiated Agreement (BATNA)?",
              "channel": "Simple Explain",
              "url": "https://www.youtube.com/watch?v=zSdhd3URSdI",
              "embedUrl": "https://www.youtube.com/embed/zSdhd3URSdI",
              "thumbnail": "https://i.ytimg.com/vi/zSdhd3URSdI/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Anchoring and the First Offer",
            "objective": "Understand how the first number shapes the whole negotiation and how to set or resist an anchor.",
            "intro": "The first number mentioned in a negotiation pulls everything that follows toward it, even when both sides know it is somewhat arbitrary. This pull is called anchoring, and it is one of the most reliable forces in any bargaining conversation.\n\nDeciding whether to anchor first, and how, is a real strategic choice rather than a matter of nerve. Used well, an anchor sets the terms of the discussion before the other side has fully made up their mind.",
            "sections": [
              {
                "heading": "How an anchor pulls the deal",
                "body": "If you are selling a used car and ask for twelve thousand, every counteroffer will orbit that figure, and a buyer who hoped to pay eight may end up around ten. Had you opened at nine thousand to seem reasonable, the same buyer would likely have settled near eight. The opening number quietly resets what both people treat as the normal range, which is why a confident, justified first offer is so powerful."
              },
              {
                "heading": "When to make the first offer",
                "body": "Anchor first when you have a reasonable sense of the market value, because you set the frame; let the other side anchor when you genuinely do not know the range and might lowball yourself by accident. A freelancer who has researched typical rates should state a number with a brief reason attached, such as the value the project will create. The justification matters as much as the figure, since a naked number invites haggling while a reasoned one invites agreement."
              },
              {
                "heading": "Defending against their anchor",
                "body": "When the other side throws out an extreme number first, do not counter near it, because countering near it accepts their frame. Instead, name the move calmly and re-anchor with your own reasoned figure, for example replying that the quote is far outside the market and that comparable work runs closer to your own number. Stepping back to your own range breaks the gravitational pull of their opening."
              }
            ],
            "keyPoints": [
              "The first number stated becomes an anchor that drags later offers toward it",
              "Anchor first when you know the range; let them go first when you do not",
              "Always attach a reason to your anchor so it reads as justified, not random",
              "Counter an extreme anchor by re-anchoring with your own figure, not by meeting near theirs"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Believing it is always smarter to let the other side name a number first",
              "Setting an aggressive anchor with no justification, which just signals you are not serious",
              "Countering an extreme opening offer with a small adjustment, which silently accepts their frame"
            ],
            "practice": "Pick something you might buy or sell soon. Research a realistic market range, then write your opening anchor and a one-sentence justification for it. Separately, write how you would respond out loud if the other party opened with a number far outside that range.",
            "needsVideo": true,
            "videoQuery": "Anchoring and the First Offer tutorial",
            "video": {
              "id": "JLeyIdWv2Q8",
              "title": "The Anchoring Bias: Why The First Offer Matters",
              "channel": "Sprouts",
              "url": "https://www.youtube.com/watch?v=JLeyIdWv2Q8",
              "embedUrl": "https://www.youtube.com/embed/JLeyIdWv2Q8",
              "thumbnail": "https://i.ytimg.com/vi/JLeyIdWv2Q8/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          }
        ],
        "quiz": [
          {
            "question": "Two managers both insist they need the same open conference room at 2pm. What is the most useful first move?",
            "options": [
              "Split the time so each gets thirty minutes",
              "Ask each why they need that specific room and time",
              "Let the more senior manager have it",
              "Flip a coin to keep things fair"
            ],
            "answerIndex": 1,
            "explanation": "Asking why surfaces the interests behind the identical positions, which may turn out to be compatible and solvable without anyone losing."
          },
          {
            "question": "Which statement best describes your BATNA?",
            "options": [
              "The lowest offer you are willing to accept",
              "The number you are hoping to walk away with",
              "What you will do if this negotiation fails to reach agreement",
              "The first offer you put on the table"
            ],
            "answerIndex": 2,
            "explanation": "A BATNA is your best alternative if no deal is reached, and it is distinct from your bottom line or your hoped-for outcome."
          },
          {
            "question": "You have researched the market and know the typical price range well. What does anchoring advice suggest?",
            "options": [
              "Let the other side name a number first to stay safe",
              "Make a confident first offer with a reason attached",
              "Refuse to discuss numbers until the end",
              "Open with an extreme figure and no explanation"
            ],
            "answerIndex": 1,
            "explanation": "When you know the range, anchoring first sets the frame, and attaching a justification makes the number read as reasonable rather than arbitrary."
          },
          {
            "question": "The other side opens with an offer far outside any reasonable range. What is the recommended response?",
            "options": [
              "Counter with a number close to theirs to keep things moving",
              "Accept their frame and negotiate within it",
              "Walk away immediately without comment",
              "Name the move calmly and re-anchor with your own reasoned figure"
            ],
            "answerIndex": 3,
            "explanation": "Countering near an extreme anchor accepts its pull, so the better move is to step back to your own justified range."
          }
        ]
      },
      {
        "title": "At the Table",
        "summary": "The live skills: listening, making offers, trading concessions, and absorbing pushback.",
        "lessons": [
          {
            "title": "Active Listening That Earns Trust",
            "objective": "Use listening as a tool to gather information and make the other side feel understood enough to move.",
            "intro": "In most negotiations people are so busy preparing their next argument that they barely hear the other side. Yet the person who listens best usually learns the information that unlocks the deal.\n\nActive listening is not passive politeness; it is a deliberate technique that lowers tension, surfaces hidden interests, and makes the other party more willing to say yes. It costs you nothing and changes the temperature of the room.",
            "sections": [
              {
                "heading": "Listen to learn, not to reply",
                "body": "When a client says your timeline is too slow, the instinct is to defend it, but the better move is to ask what is driving the urgency. You might discover a board meeting in three weeks that a partial delivery would cover. The information you gain by staying curious is almost always worth more than the point you were about to make."
              },
              {
                "heading": "Label and reflect",
                "body": "Briefly naming what you hear shows the other person you understood, which makes them feel safe enough to reveal more. Saying something like it sounds like the real worry is going over budget rather than the features themselves invites them to confirm or correct you. This reflecting back, done in your own plain words, slows the conversation and steadily builds trust."
              },
              {
                "heading": "Let silence work",
                "body": "After you ask a real question, stop talking and let the pause sit, because people tend to fill silence with useful information. If you ask why a vendor needs payment within ten days and then simply wait, they may volunteer that their own cash flow is tight, which hands you a concession to trade. Rushing to fill the gap yourself throws that advantage away."
              }
            ],
            "keyPoints": [
              "Listen to gather information, not just to wait for your turn to speak",
              "Reflecting the other side's concern back in plain words makes them feel understood",
              "Open questions surface interests that demands and arguments never reveal",
              "Silence after a question often draws out the most valuable information"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Treating listening as a courtesy rather than a way to gather usable intelligence",
              "Jumping in to fill every silence, which cuts off information the other side was about to share",
              "Reflecting back so mechanically that it sounds like a scripted technique instead of real attention"
            ],
            "practice": "In your next two conversations, practice asking one open why or how question and then staying completely silent for at least five seconds afterward. Note what extra information the other person volunteered into that silence.",
            "needsVideo": true,
            "videoQuery": "Active Listening That Earns Trust tutorial",
            "video": {
              "id": "XesfWlaiLOo",
              "title": "Active Listening Secrets That Build Trust & Relationships",
              "channel": "Tracy Hensel",
              "url": "https://www.youtube.com/watch?v=XesfWlaiLOo",
              "embedUrl": "https://www.youtube.com/embed/XesfWlaiLOo",
              "thumbnail": "https://i.ytimg.com/vi/XesfWlaiLOo/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Making Offers and Trading Concessions",
            "objective": "Structure offers so each concession you give earns a concession in return and signals where you can settle.",
            "intro": "Every concession you make sends a message, whether you intend it to or not. Give ground too easily and you teach the other side that pushing harder always works.\n\nSkilled negotiators treat concessions as trades, never as gifts. They plan what they can give, what they want in return, and the order in which they will move, so that the pattern itself guides both sides toward a fair settlement.",
            "sections": [
              {
                "heading": "Never give, always trade",
                "body": "When a buyer asks for a lower price, the weak move is to simply drop it, while the strong move is to attach a condition. You might say you can lower the price if they commit to a twelve-month contract, which turns a one-sided giveaway into an exchange. The phrase if you do this, then I can do that should sit at the center of almost every concession you make."
              },
              {
                "heading": "Shrink your concessions over time",
                "body": "The size and speed of your moves tell a story, so dropping from a hundred to ninety to eighty signals you will keep falling, whereas moving from a hundred to ninety to eighty-six to eighty-four signals you are approaching your limit. Each smaller step quietly says there is little room left. This pattern helps the other side find your settling point without you ever announcing it."
              },
              {
                "heading": "Bundle and trade across issues",
                "body": "Most negotiations involve more than price, and that is where real value is created, because you can trade an issue you care little about for one you care about deeply. If delivery date matters more to them and warranty length matters more to you, you can concede a faster delivery in exchange for a shorter warranty. Trading across different issues lets both sides come out ahead instead of merely splitting one number."
              }
            ],
            "keyPoints": [
              "Frame every concession as a conditional trade using if you, then I",
              "Shrinking concession sizes signals you are nearing your limit",
              "Negotiate multiple issues together so you can trade low-value items for high-value ones",
              "An easy giveaway teaches the other side that pressure works, so make them earn each move"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Making concessions without asking for anything in return, training the other side to keep pushing",
              "Negotiating one issue at a time, which removes the chance to trade across issues for mutual gain",
              "Making large or rapid concessions that signal you have far more room than you intend to reveal"
            ],
            "practice": "Take an upcoming negotiation and list every issue at stake, not just price. Rank each issue by how much it matters to you, then identify one low-priority item you could trade away in exchange for a high-priority one.",
            "needsVideo": true,
            "videoQuery": "Making Offers and Trading Concessions tutorial",
            "video": {
              "id": "W4e7TxBH9X8",
              "title": "Strategies for Trading Concessions in Negotiation",
              "channel": "The Art of Negotiation",
              "url": "https://www.youtube.com/watch?v=W4e7TxBH9X8",
              "embedUrl": "https://www.youtube.com/embed/W4e7TxBH9X8",
              "thumbnail": "https://i.ytimg.com/vi/W4e7TxBH9X8/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Handling Pushback Without Folding",
            "objective": "Stay composed and keep the conversation problem-focused when the other side pressures, objects, or says no.",
            "intro": "Pushback is not a sign the negotiation is failing; it is a normal part of how people test whether they have reached the real limit. The danger is reacting emotionally and either caving or escalating.\n\nThe goal is to absorb pressure without taking it personally, keep the discussion focused on the problem rather than the people, and turn objections into information you can use.",
            "sections": [
              {
                "heading": "Pause before you react",
                "body": "When someone says your price is ridiculous, the body wants to defend or fight back, so the most valuable skill is a deliberate pause before responding. Taking a slow breath and asking what specifically feels too high converts an attack into a question you can work with. That short gap between trigger and response is where good negotiators do their best work."
              },
              {
                "heading": "Separate the person from the problem",
                "body": "It is easy to hear a hard no as a personal rejection, but treating it as information about the deal keeps you steady. Instead of arguing back, you can stand beside them against the shared problem by saying you both want this to work, so let us figure out what is getting in the way. Framing yourselves as partners solving a puzzle defuses the sense of a contest."
              },
              {
                "heading": "Use objective standards",
                "body": "When pressure turns into a stalemate, pointing to a fair outside standard moves the fight away from willpower. Citing market rates, an independent appraisal, or a published price index lets the deal rest on something neither side controls. Saying that comparable contracts settle around this figure is far harder to dismiss than simply insisting on your number."
              }
            ],
            "keyPoints": [
              "Pushback is a normal test of limits, not a sign of failure",
              "A deliberate pause turns a reaction into a considered response",
              "Treat a hard no as information about the deal, not a personal attack",
              "Anchoring on objective standards moves the contest away from sheer willpower"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Reading every objection as a personal attack and responding defensively",
              "Caving the moment the other side pushes hard, which rewards the pressure",
              "Meeting aggression with aggression, turning a solvable problem into a contest of egos"
            ],
            "practice": "Recall the last time someone pushed back hard on you in a negotiation. Write what you actually said, then rewrite your response using a pause plus one clarifying question, and rewrite it once more invoking an objective standard.",
            "needsVideo": true,
            "videoQuery": "Handling Pushback Without Folding tutorial",
            "video": {
              "id": "Oo87neA9Qo8",
              "title": "Chris Voss on how to handle negotiation points that are non starters for you",
              "channel": "Built to Sell",
              "url": "https://www.youtube.com/watch?v=Oo87neA9Qo8",
              "embedUrl": "https://www.youtube.com/embed/Oo87neA9Qo8",
              "thumbnail": "https://i.ytimg.com/vi/Oo87neA9Qo8/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          }
        ],
        "quiz": [
          {
            "question": "A vendor pauses after you ask why they need payment so quickly. What should you usually do?",
            "options": [
              "Fill the silence by offering faster payment",
              "Stay quiet and let them respond",
              "Change the subject to avoid awkwardness",
              "Withdraw the question and move on"
            ],
            "answerIndex": 1,
            "explanation": "Silence after a real question often draws out valuable information, so letting the pause sit works in your favor."
          },
          {
            "question": "A buyer asks you to lower your price. What is the strongest move?",
            "options": [
              "Lower it immediately to keep goodwill",
              "Refuse to change anything at all",
              "Offer the lower price only if they agree to a longer contract",
              "Split the difference right away"
            ],
            "answerIndex": 2,
            "explanation": "Attaching a condition turns a one-sided giveaway into a trade, which is the core of handling concessions well."
          },
          {
            "question": "What does a shrinking pattern of concessions, such as moving from 100 to 90 to 86 to 84, signal?",
            "options": [
              "That you have plenty of room left to move",
              "That you are approaching your limit",
              "That you are about to walk away",
              "That the deal is already closed"
            ],
            "answerIndex": 1,
            "explanation": "Each smaller step quietly tells the other side that little room remains, helping them find your settling point."
          },
          {
            "question": "When pressure leads to a stalemate over price, which approach best moves things forward?",
            "options": [
              "Repeat your number more firmly each time",
              "Point to an objective standard like market rates or an appraisal",
              "Threaten to end the negotiation",
              "Match their aggression to show strength"
            ],
            "answerIndex": 1,
            "explanation": "An objective outside standard rests the deal on something neither side controls, shifting it away from a contest of wills."
          }
        ]
      },
      {
        "title": "Closing and Relationships",
        "summary": "Seal durable, fair agreements, withstand hardball tactics, and keep the relationship strong.",
        "lessons": [
          {
            "title": "Finding the Win-Win",
            "objective": "Expand the deal so both sides gain, then close cleanly with terms everyone understands.",
            "intro": "The best agreements are not those where you squeezed every last dollar, but those where both sides got enough of what mattered to follow through willingly. A deal someone resents is a deal they will quietly undermine later.\n\nFinding the win-win means looking for value to create before fighting over how to divide it, then closing in a way that leaves no confusion about what was agreed.",
            "sections": [
              {
                "heading": "Grow the pie before splitting it",
                "body": "Because people value different things, you can often make the whole deal bigger before dividing it. A small supplier negotiating with a large retailer might accept a lower per-unit price in exchange for a public case study and a multi-year commitment, gains the retailer can give cheaply but that are worth a great deal to the supplier. Looking for these mismatches in what each side values turns a fixed fight into a larger shared gain."
              },
              {
                "heading": "Confirm the close clearly",
                "body": "Many deals fall apart after the handshake because the two sides remembered different things, so the moment you sense agreement, summarize the terms out loud and confirm them. Saying so to be clear, we agreed on this price, this delivery date, and this payment schedule, is that right, catches mismatches while everyone is still in the room. A few minutes of confirmation prevents weeks of dispute."
              },
              {
                "heading": "Make it easy to say yes",
                "body": "Sometimes the last gap is not the terms but the other person's need to feel the decision is sound, so help them justify it to themselves or their boss. Offering a short written summary of why the deal makes sense, or a small face-saving concession at the end, can carry a hesitant party over the line. The goal is a yes they will feel good defending tomorrow."
              }
            ],
            "keyPoints": [
              "Look for value to create before arguing over how to divide it",
              "Differences in what each side values are the raw material of win-win deals",
              "Summarize and confirm terms out loud before you part to prevent later disputes",
              "Help the other side justify the yes so the agreement actually sticks"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Treating every negotiation as fixed pie where one side's gain must be the other's loss",
              "Skipping a clear verbal confirmation of terms, leaving room for honest disagreement later",
              "Winning so hard that the other side resents the deal and drags their feet on delivery"
            ],
            "practice": "For a deal you are working on, list three things you value highly and three the other side likely values highly. Find at least one pair where you each value something the other can give cheaply, and sketch a trade around it.",
            "needsVideo": true,
            "videoQuery": "Finding the Win-Win tutorial",
            "video": {
              "id": "Wzimr2fAhrU",
              "title": "Negotiation tutorial - Interest-based bargaining (Expanding the pie, integrative negotiations)",
              "channel": "365 Financial Analyst",
              "url": "https://www.youtube.com/watch?v=Wzimr2fAhrU",
              "embedUrl": "https://www.youtube.com/embed/Wzimr2fAhrU",
              "thumbnail": "https://i.ytimg.com/vi/Wzimr2fAhrU/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Dealing With Hardball Tactics",
            "objective": "Recognize common pressure tactics and respond to them calmly without rewarding the behavior.",
            "intro": "Some people negotiate by manipulation rather than problem-solving, using pressure, false deadlines, or good-cop bad-cop routines to rattle you into a worse deal. These tactics work mainly on people who do not recognize them.\n\nThe defense is almost always the same: name what is happening, stay calm, and refuse to let the tactic change the substance of the deal. Once a tactic is named out loud, most of its power disappears.",
            "sections": [
              {
                "heading": "Spotting the common plays",
                "body": "The exploding offer that expires in an hour, the sudden extra demand once you thought you were done, the claim of a higher authority who must approve everything, all share the goal of pressuring you to decide fast and concede. Knowing their names lets you see them as moves on a board rather than emergencies. The artificial deadline that vanishes the moment you call it is the classic example."
              },
              {
                "heading": "Name it to neutralize it",
                "body": "When you suspect a tactic, describe it plainly and without anger, which forces the other side to either drop it or defend it. Saying that it seems like artificial time pressure and asking whether the offer is real or just a deadline puts the move in the open. Most tactics rely on going unnoticed, so simply noticing it out loud often ends it."
              },
              {
                "heading": "Hold the line on substance",
                "body": "The key is to refuse to let pressure change the actual terms, because giving in to a tactic teaches the other side it works. If a late add-on demand appears after you had agreed, you can calmly say you are happy to discuss it as a new item but that it does not change what you already settled. Keeping the substance separate from the theatrics protects the deal you fairly reached."
              }
            ],
            "keyPoints": [
              "Hardball tactics rely on pressure and surprise rather than the merits of the deal",
              "Most common tactics fail once you recognize and name them out loud",
              "Stay calm; reacting emotionally is exactly what the tactic is designed to provoke",
              "Never let a pressure tactic change the substance of what you already agreed"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Mistaking an artificial, named-tactic deadline for a genuine business constraint",
              "Responding to manipulation with anger, which hands the other side control of the tone",
              "Conceding to a late add-on demand, which rewards the tactic and invites more of them"
            ],
            "practice": "Write down three hardball tactics you have experienced or expect, such as an exploding deadline or a surprise final demand. For each, draft one calm sentence that names the tactic and one sentence that holds your position without escalating.",
            "needsVideo": true,
            "videoQuery": "Dealing With Hardball Tactics tutorial",
            "video": {
              "id": "p5Mx5m6FepU",
              "title": "Hardball Tactics in a Distributive Negotiation",
              "channel": "patrik hultberg",
              "url": "https://www.youtube.com/watch?v=p5Mx5m6FepU",
              "embedUrl": "https://www.youtube.com/embed/p5Mx5m6FepU",
              "thumbnail": "https://i.ytimg.com/vi/p5Mx5m6FepU/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Protecting the Relationship",
            "objective": "Close deals in a way that preserves trust and goodwill for the next negotiation, not just this one.",
            "intro": "Most negotiations that matter are with people you will deal with again: your manager, a key supplier, a long-term client, a colleague. Winning today at the cost of the relationship is usually a bad trade.\n\nProtecting the relationship is not about being soft; it is about being firm on the substance while staying warm and respectful with the person. Done well, a tough negotiation can actually deepen trust.",
            "sections": [
              {
                "heading": "Be hard on the problem, soft on the person",
                "body": "You can push firmly for your interests while signaling that you respect and value the other person, and the two are not in conflict. Pairing a firm position with a warm tone, such as saying you really want to keep working together and that is exactly why you need this number to work, separates the toughness of the issue from any hostility toward them. People will give ground to someone who fights fair and treats them well."
              },
              {
                "heading": "Protect their dignity",
                "body": "Never let the other side leave feeling humiliated, because a deal that makes someone look foolish to their boss or themselves breeds quiet resentment. If you have clearly won the main point, offering a small concession at the end lets them save face and walk away with their pride intact. That graceful exit is what makes them willing to deal with you again."
              },
              {
                "heading": "Close warm and follow through",
                "body": "How you end the conversation shapes the next one, so close by thanking the other side genuinely and confirming the next steps. Then do exactly what you promised, on time, because reliability after the deal builds the trust that makes future negotiations shorter and easier. A reputation for keeping your word is worth more than any single concession you could win."
              }
            ],
            "keyPoints": [
              "Be firm on the substance while staying warm and respectful with the person",
              "Let the other side save face, especially when you have clearly won the main point",
              "A humiliated counterpart resents the deal and undermines it later",
              "Following through reliably after the deal is what makes future negotiations easier"
            ],
            "codeExamples": [],
            "commonMistakes": [
              "Believing you must choose between getting a good deal and keeping a good relationship",
              "Maximizing a one-time win at the expense of a counterpart you will face again",
              "Letting the other side lose face, which turns a signed deal into quiet resistance"
            ],
            "practice": "Think of a person you negotiate with repeatedly. Write one phrase you can use to stay firm on an issue while showing you value them, and identify one small face-saving concession you could offer at the end of a tough conversation with them.",
            "needsVideo": true,
            "videoQuery": "Protecting the Relationship tutorial",
            "video": {
              "id": "qdbFsg0jCZk",
              "title": "Principled Negotiation: Separate People from the Problem",
              "channel": "Mediator Academy",
              "url": "https://www.youtube.com/watch?v=qdbFsg0jCZk",
              "embedUrl": "https://www.youtube.com/embed/qdbFsg0jCZk",
              "thumbnail": "https://i.ytimg.com/vi/qdbFsg0jCZk/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          }
        ],
        "quiz": [
          {
            "question": "What is the core idea behind growing the pie before splitting it?",
            "options": [
              "Always demand more than you need so you can give some back",
              "Because sides value things differently, you can create value before dividing it",
              "Whoever talks first gets the larger share",
              "Splitting everything exactly in half is always fairest"
            ],
            "answerIndex": 1,
            "explanation": "Differences in what each side values let you create additional value through trades before arguing over the division."
          },
          {
            "question": "You sense agreement on a deal. What should you do before ending the conversation?",
            "options": [
              "Leave quickly before anyone changes their mind",
              "Summarize the terms out loud and confirm them",
              "Add one more demand to test their resolve",
              "Avoid repeating the terms so nothing is reopened"
            ],
            "answerIndex": 1,
            "explanation": "Confirming terms out loud while everyone is present catches honest mismatches before they become disputes."
          },
          {
            "question": "The other side suddenly imposes a one-hour deadline to accept. What is the best response?",
            "options": [
              "Accept fast so you do not lose the deal",
              "Match it with a deadline of your own",
              "Calmly name the time pressure and ask whether the offer is genuine",
              "Walk away without saying anything"
            ],
            "answerIndex": 2,
            "explanation": "Naming an artificial deadline out loud forces the other side to drop it or defend it, removing most of its power."
          },
          {
            "question": "Why offer a small concession at the very end when you have clearly won the main point?",
            "options": [
              "To reopen the negotiation from scratch",
              "To let the other side save face and protect the relationship",
              "To signal you were bluffing all along",
              "To slow the deal down deliberately"
            ],
            "answerIndex": 1,
            "explanation": "A small face-saving concession lets the other side keep their dignity, which protects the relationship and future dealings."
          }
        ]
      }
    ]
  },
  {
    "title": "Web Development: HTML & CSS",
    "subtitle": "Build and style your first web pages",
    "description": "A hands-on course for total beginners who want to build real web pages from scratch. You will learn how HTML gives a page its structure, how CSS controls how it looks, and how to arrange and adapt a layout so it works on phones and desktops. By the end you will have built and styled a small, responsive page of your own.",
    "level": "Beginner",
    "estimatedHours": 8,
    "prerequisites": [
      "Comfort using a computer and a web browser",
      "A plain text editor such as VS Code, or any free online code editor",
      "No prior coding experience needed"
    ],
    "outcomes": [
      "Write valid HTML to structure a page with headings, paragraphs, links, images, and lists",
      "Use semantic elements like header, nav, main, and footer to organize content meaningfully",
      "Style a page with CSS selectors, colors, fonts, and the box model",
      "Control spacing precisely using margin, padding, and borders",
      "Arrange items in a row or column with flexbox",
      "Build a small page that adapts to different screen sizes with a media query"
    ],
    "modules": [
      {
        "title": "HTML Structure: The Skeleton of a Page",
        "summary": "Learn what HTML is and how to build the structure of a web page using elements, headings, paragraphs, links, images, lists, and semantic tags.",
        "lessons": [
          {
            "title": "Elements and Tags: How HTML Works",
            "objective": "You will be able to write a basic HTML element using an opening tag, content, and a closing tag, and set up a valid page skeleton.",
            "intro": "Every web page you have ever visited is built from HTML, which stands for HyperText Markup Language. HTML does not make things pretty or interactive on its own; its single job is to describe what each piece of content is, so the browser knows a heading is a heading and a paragraph is a paragraph.\n\nIn this lesson you will meet the basic building block of HTML, the element, and learn how to wrap your content in tags so the browser understands it.",
            "sections": [
              {
                "heading": "What an element is made of",
                "body": "An HTML element is usually made of three parts: an opening tag, the content, and a closing tag. For example, in <p>Hello</p>, the <p> is the opening tag, Hello is the content, and </p> is the closing tag, which has a slash before the letter. The browser reads this and knows the word Hello is a paragraph."
              },
              {
                "heading": "Tags come in pairs (mostly)",
                "body": "Most tags come in matching open and close pairs that surround content, like <h1>My Title</h1>. A few elements, such as the image tag and the line break, are empty and have no closing tag because they hold no text inside them. Forgetting the closing slash or the matching closing tag is the most common beginner error, so always check that every opening tag you write has a partner."
              },
              {
                "heading": "The page skeleton",
                "body": "Every HTML document starts with the same basic frame: a doctype line, an html element, a head for information about the page, and a body for the visible content. The head holds things like the page title that shows in the browser tab, while everything the visitor sees lives inside the body. You can think of this skeleton as the frame of a house that you fill in with rooms."
              }
            ],
            "keyPoints": [
              "HTML describes what content is, not how it looks",
              "An element is an opening tag, content, and a closing tag",
              "Closing tags include a slash, like </p>",
              "A few elements such as img are empty and have no closing tag",
              "Visible content goes inside the body element"
            ],
            "codeExamples": [
              {
                "language": "html",
                "code": "<!DOCTYPE html>\n<html>\n  <head>\n    <title>My First Page</title>\n  </head>\n  <body>\n    <p>Hello, world!</p>\n  </body>\n</html>",
                "caption": "A minimal but complete HTML page with the standard skeleton and one paragraph."
              }
            ],
            "commonMistakes": [
              "Thinking HTML controls colors and layout; that is CSS, while HTML only defines structure",
              "Forgetting the closing tag or the slash, which can break how the page displays",
              "Believing every tag needs a closing tag, when empty elements like img do not"
            ],
            "practice": "Create a file called index.html, type the page skeleton from the example, change the title to your name, and open the file in your browser to see the tab title and paragraph.",
            "needsVideo": true,
            "videoQuery": "Elements and Tags: How HTML Works tutorial",
            "video": {
              "id": "7y4h7pFbjHA",
              "title": "HTML Tags & Elements Explained: Headings, Paragraphs, Links & Images",
              "channel": "Altech Dev",
              "url": "https://www.youtube.com/watch?v=7y4h7pFbjHA",
              "embedUrl": "https://www.youtube.com/embed/7y4h7pFbjHA",
              "thumbnail": "https://i.ytimg.com/vi/7y4h7pFbjHA/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Headings, Paragraphs, Links, and Images",
            "objective": "You will be able to add headings, paragraphs, clickable links, and images to a page using the correct tags and attributes.",
            "intro": "Now that you can build a page skeleton, it is time to fill it with the content people actually read and click. Headings and paragraphs organize your text, while links and images connect your page to the rest of the web and bring it to life.\n\nThis lesson introduces these four everyday elements and the idea of attributes, which give tags extra information.",
            "sections": [
              {
                "heading": "Headings and paragraphs",
                "body": "HTML gives you six heading levels, from <h1> for the most important title down to <h6> for the least. You should use one <h1> per page for the main title, then use <h2> and lower for subsections, much like an outline. Regular blocks of text go inside paragraph tags, so a sentence like <p>Welcome to my site.</p> displays as a normal paragraph."
              },
              {
                "heading": "Links with the anchor tag",
                "body": "Links are made with the anchor tag <a>, and the destination goes inside an attribute called href. For example, <a href=\"https://example.com\">Visit Example</a> shows the words Visit Example as a clickable link that opens that address. An attribute is extra information written inside the opening tag as a name and a value in quotes."
              },
              {
                "heading": "Adding images",
                "body": "Images use the empty <img> tag, which needs a src attribute pointing to the image file and an alt attribute describing the picture in words. The alt text is read aloud by screen readers and shows if the image fails to load, so it is important for accessibility. A complete image looks like <img src=\"cat.jpg\" alt=\"A sleeping orange cat\">."
              }
            ],
            "keyPoints": [
              "Use one h1 for the main title and h2 to h6 for subsections",
              "Paragraph text goes inside p tags",
              "Links use the a tag with an href attribute for the destination",
              "Images use img with a src for the file and alt for a description",
              "Attributes are name and value pairs inside the opening tag"
            ],
            "codeExamples": [
              {
                "language": "html",
                "code": "<h1>My Travel Blog</h1>\n<p>Welcome! Here are my favorite places.</p>\n<a href=\"https://example.com\">Read more</a>\n<img src=\"beach.jpg\" alt=\"A sunny beach at sunset\">",
                "caption": "A heading, a paragraph, a link with href, and an image with src and alt."
              }
            ],
            "commonMistakes": [
              "Choosing a heading level by how big it looks instead of by its place in the outline",
              "Leaving off the alt attribute on images, which hurts accessibility",
              "Forgetting the quotes around an attribute value such as the href address"
            ],
            "practice": "Add an h1 title, two paragraphs, a link to your favorite website, and an image (real or placeholder) with descriptive alt text to your index.html page.",
            "needsVideo": true,
            "videoQuery": "Headings, Paragraphs, Links, and Images tutorial",
            "video": {
              "id": "qLsE7MO6gQc",
              "title": "HTML | Headers, Paragraphs, Links, and Images Explained in 13 minutes",
              "channel": "not a hacker",
              "url": "https://www.youtube.com/watch?v=qLsE7MO6gQc",
              "embedUrl": "https://www.youtube.com/embed/qLsE7MO6gQc",
              "thumbnail": "https://i.ytimg.com/vi/qLsE7MO6gQc/hqdefault.jpg",
              "durationSeconds": 780,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Lists and Semantic Structure",
            "objective": "You will be able to create ordered and unordered lists and use semantic elements to give your page meaningful structure.",
            "intro": "Real pages are more than loose paragraphs; they group related items into lists and divide content into clear regions like a header and a footer. HTML offers tags built exactly for these jobs, and using the right one makes your page easier to read, easier to style, and friendlier to search engines and screen readers.\n\nIn this lesson you will create lists and learn the semantic elements that label the major parts of a page.",
            "sections": [
              {
                "heading": "Unordered and ordered lists",
                "body": "An unordered list, made with <ul>, shows items with bullet points and is for things where order does not matter, like a grocery list. An ordered list, made with <ol>, numbers its items and is for steps that happen in sequence, like a recipe. In both cases each item is wrapped in its own <li> tag, so a two item bullet list is <ul><li>Apples</li><li>Bread</li></ul>."
              },
              {
                "heading": "What semantic means",
                "body": "A semantic element is one whose name describes the meaning of its content, not just its appearance. Instead of wrapping everything in a generic <div>, you can use <header> for the top, <nav> for navigation links, <main> for the primary content, and <footer> for the bottom. This tells browsers and assistive technology what each region is, which a plain div cannot do."
              },
              {
                "heading": "Putting regions together",
                "body": "A typical page nests these regions in a logical order: a header at the top often containing a nav, then a main area with the page content, and a footer at the bottom. For example you might write <header>...</header> followed by <main>...</main> and then <footer>...</footer>. This structure makes your page self documenting, so anyone reading the code can immediately see how it is organized."
              }
            ],
            "keyPoints": [
              "Use ul for unordered bullet lists and ol for numbered lists",
              "Every list item goes inside its own li tag",
              "Semantic tags describe meaning, not just appearance",
              "header, nav, main, and footer label the major regions of a page",
              "Semantic structure helps accessibility and search engines"
            ],
            "codeExamples": [
              {
                "language": "html",
                "code": "<header>\n  <h1>My Site</h1>\n  <nav>\n    <ul>\n      <li><a href=\"#about\">About</a></li>\n      <li><a href=\"#contact\">Contact</a></li>\n    </ul>\n  </nav>\n</header>\n<main>\n  <p>Welcome to my page.</p>\n</main>\n<footer>\n  <p>Copyright 2026</p>\n</footer>",
                "caption": "A page using semantic regions with a navigation list inside the header."
              }
            ],
            "commonMistakes": [
              "Using a div for everything when a semantic element like main or nav fits better",
              "Putting list items directly in the page without wrapping them in ul or ol",
              "Adding more than one main element, when a page should have exactly one"
            ],
            "practice": "Rebuild your index.html so its content sits inside header, main, and footer elements, and add a navigation menu in the header using a ul with two or three links.",
            "needsVideo": true,
            "videoQuery": "Lists and Semantic Structure tutorial",
            "video": {
              "id": "fWBqwz9Nju8",
              "title": "HTML ul, ol, and li Tag Tutorial: Easy Guide for Beginners",
              "channel": "tutor4u",
              "url": "https://www.youtube.com/watch?v=fWBqwz9Nju8",
              "embedUrl": "https://www.youtube.com/embed/fWBqwz9Nju8",
              "thumbnail": "https://i.ytimg.com/vi/fWBqwz9Nju8/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          }
        ],
        "quiz": [
          {
            "question": "What is the correct way to write a paragraph element?",
            "options": [
              "<p>Hello</p>",
              "<paragraph>Hello</paragraph>",
              "<p>Hello<p>",
              "[p]Hello[/p]"
            ],
            "answerIndex": 0,
            "explanation": "A paragraph uses the p tag with a matching closing tag that includes a slash, so <p>Hello</p> is correct."
          },
          {
            "question": "Which attribute tells an anchor tag where the link should go?",
            "options": [
              "src",
              "href",
              "alt",
              "link"
            ],
            "answerIndex": 1,
            "explanation": "The href attribute on an a tag holds the destination address of the link."
          },
          {
            "question": "When should you use an ordered list (ol) instead of an unordered list (ul)?",
            "options": [
              "When you want bigger text",
              "When the order of the items matters, like steps in a recipe",
              "When the list has more than five items",
              "When the items are links"
            ],
            "answerIndex": 1,
            "explanation": "An ordered list numbers its items and is meant for content where sequence matters, such as steps."
          },
          {
            "question": "What is the main benefit of semantic elements like header, nav, and main?",
            "options": [
              "They make text automatically bold",
              "They describe the meaning of each region for browsers and assistive technology",
              "They are required for the page to load",
              "They change the page colors"
            ],
            "answerIndex": 1,
            "explanation": "Semantic elements convey what each part of the page means, helping accessibility and search engines, which a generic div cannot do."
          }
        ]
      },
      {
        "title": "CSS Styling: Making It Look Good",
        "summary": "Learn how CSS controls the appearance of a page, including selectors, colors, fonts, the box model, and spacing.",
        "lessons": [
          {
            "title": "Selectors: Choosing What to Style",
            "objective": "You will be able to write CSS rules that target elements by tag, class, and id to apply styles.",
            "intro": "HTML gives a page its structure, but on its own it looks plain and gray. CSS, which stands for Cascading Style Sheets, is the language that controls how that structure looks: its colors, fonts, sizes, and spacing.\n\nBefore you can style anything you need a way to point at the right elements, and that is the job of selectors. This lesson teaches the three selectors you will use most.",
            "sections": [
              {
                "heading": "The shape of a CSS rule",
                "body": "A CSS rule has a selector that chooses elements and a block of declarations in curly braces that set their styles. Each declaration is a property and a value separated by a colon and ended with a semicolon, like color: blue;. So a rule that makes all paragraphs blue is p { color: blue; }."
              },
              {
                "heading": "Tag, class, and id selectors",
                "body": "A tag selector like p targets every element of that type. A class selector starts with a dot, like .warning, and targets any element you have given that class with class=\"warning\" in the HTML, so you can reuse it on many elements. An id selector starts with a hash, like #header, and targets the single element with that id, which should be unique on the page."
              },
              {
                "heading": "Connecting CSS to HTML",
                "body": "The cleanest way to add styles is to write them in a separate file, such as styles.css, and link it from the head of your HTML with a link tag. You write <link rel=\"stylesheet\" href=\"styles.css\"> inside the head, and the browser applies those rules to the page. Keeping CSS in its own file keeps your HTML readable and lets one stylesheet style many pages."
              }
            ],
            "keyPoints": [
              "CSS controls how a page looks; HTML controls what it is",
              "A rule is a selector plus declarations of property: value;",
              "Tag selectors target all elements of a type",
              "Class selectors start with a dot and can be reused",
              "Id selectors start with a hash and target one unique element"
            ],
            "codeExamples": [
              {
                "language": "css",
                "code": "p {\n  color: navy;\n}\n\n.highlight {\n  background-color: yellow;\n}\n\n#main-title {\n  font-size: 32px;\n}",
                "caption": "A tag selector, a class selector, and an id selector each setting one property."
              }
            ],
            "commonMistakes": [
              "Mixing up the dot for classes and the hash for ids",
              "Reusing the same id on more than one element, when ids should be unique",
              "Forgetting the semicolon at the end of a declaration, which can break the rules after it"
            ],
            "practice": "Create a styles.css file, link it from your HTML head, then add a rule that colors all paragraphs and a class rule you apply to one element to give it a different background.",
            "needsVideo": true,
            "videoQuery": "Selectors: Choosing What to Style tutorial",
            "video": {
              "id": "WC7WurHBGs0",
              "title": "CSS Tutorial With Element, ID and Class Selectors in 2024",
              "channel": "Waatz Developer",
              "url": "https://www.youtube.com/watch?v=WC7WurHBGs0",
              "embedUrl": "https://www.youtube.com/embed/WC7WurHBGs0",
              "thumbnail": "https://i.ytimg.com/vi/WC7WurHBGs0/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Colors and Fonts",
            "objective": "You will be able to set text and background colors and change the font and size of text with CSS.",
            "intro": "Color and typography are the first things people notice about a page, and small changes here can make a site feel polished or playful. CSS gives you several ways to name colors and full control over which fonts your text uses and how big it is.\n\nThis lesson shows you how to apply colors and choose readable, attractive fonts.",
            "sections": [
              {
                "heading": "Ways to write colors",
                "body": "You can name a color with a keyword like red, but for precise control you use a hex code such as #3366ff, which mixes red, green, and blue values. Another common option is rgb, where rgb(51, 102, 255) gives the same blue by listing the red, green, and blue amounts directly. The color property sets text color and background-color sets the background behind an element."
              },
              {
                "heading": "Setting the font",
                "body": "The font-family property chooses the typeface, and you usually list several options as a fallback stack, like font-family: Arial, sans-serif;. The browser uses the first font available, and the final generic name such as sans-serif guarantees a sensible default if none are installed. Listing a fallback this way means your text always looks reasonable on any device."
              },
              {
                "heading": "Sizing text",
                "body": "The font-size property controls how large text is, and a simple unit to start with is pixels, written like font-size: 18px;. Larger numbers mean bigger text, so a heading might be 32px while body text sits comfortably around 16 to 18px. You can also make text bold with font-weight: bold; to add emphasis."
              }
            ],
            "keyPoints": [
              "Colors can be keywords, hex codes like #3366ff, or rgb values",
              "color sets text color and background-color sets the background",
              "font-family chooses the typeface and should include a fallback",
              "Always end a font-family list with a generic name like sans-serif",
              "font-size in pixels sets how large text appears"
            ],
            "codeExamples": [
              {
                "language": "css",
                "code": "body {\n  font-family: Arial, sans-serif;\n  font-size: 16px;\n  color: #222222;\n  background-color: #f5f5f5;\n}",
                "caption": "Setting the page font, text size, text color, and background color on the body."
              }
            ],
            "commonMistakes": [
              "Forgetting the number sign before a hex color code",
              "Listing only one font with no generic fallback like sans-serif",
              "Confusing color, which is text, with background-color, which is behind the element"
            ],
            "practice": "In your styles.css, set a font-family with a fallback on the body, give the page a light background-color, and make your h1 a different color from the paragraph text.",
            "needsVideo": true,
            "videoQuery": "Colors and Fonts tutorial",
            "video": {
              "id": "klXyJWlIzuY",
              "title": "CSS Text and Fonts Tutorial for Beginners - Typography",
              "channel": "Dave Gray",
              "url": "https://www.youtube.com/watch?v=klXyJWlIzuY",
              "embedUrl": "https://www.youtube.com/embed/klXyJWlIzuY",
              "thumbnail": "https://i.ytimg.com/vi/klXyJWlIzuY/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "The Box Model and Spacing",
            "objective": "You will be able to use padding, border, and margin to control the space inside and around elements.",
            "intro": "One of the most important ideas in CSS is that every element on the page is a rectangular box, even if it does not look like one. Understanding this box and the layers of space around it is the key to controlling layout and making a page feel balanced instead of cramped.\n\nThis lesson explains the box model and the difference between the kinds of spacing you can add.",
            "sections": [
              {
                "heading": "The layers of a box",
                "body": "Every element has four layers from the inside out: the content, the padding around the content, the border around the padding, and the margin outside the border. Padding is the cushion between the content and the edge of the box, while margin is the gap between this box and its neighbors. Picturing a framed photo helps: the photo is the content, the mat is the padding, the frame is the border, and the space to the next photo on the wall is the margin."
              },
              {
                "heading": "Padding and border",
                "body": "You add inner spacing with the padding property, so padding: 20px; pushes the content 20 pixels away from every edge. The border property draws a line around the padding and takes a width, a style, and a color together, like border: 2px solid black;. Increasing padding makes a button or card feel roomier without moving other elements."
              },
              {
                "heading": "Margin and collapsing space",
                "body": "Margin creates space outside the border, pushing other elements away, so margin: 16px; leaves a gap on all sides. A handy trick is margin: 0 auto; on a fixed width element, which centers it horizontally by splitting the leftover space evenly. Remember that margin is the space between boxes, while padding is the space inside a box, and mixing these up is a frequent source of confusion."
              }
            ],
            "keyPoints": [
              "Every element is a box with content, padding, border, and margin",
              "Padding is space inside the box, between content and the edge",
              "Border is the line drawn around the padding",
              "Margin is space outside the box, separating it from neighbors",
              "margin: 0 auto centers a fixed width element horizontally"
            ],
            "codeExamples": [
              {
                "language": "css",
                "code": ".card {\n  padding: 20px;\n  border: 2px solid #cccccc;\n  margin: 16px auto;\n  width: 300px;\n}",
                "caption": "A card with inner padding, a visible border, and outer margin that centers it."
              }
            ],
            "commonMistakes": [
              "Confusing padding (inside the box) with margin (outside the box)",
              "Expecting border to take only a color, when it needs width, style, and color",
              "Forgetting that a fixed width is needed for margin: 0 auto to center an element"
            ],
            "practice": "Style one element as a card by giving it a fixed width, padding, a border, and margin: 0 auto, then watch how changing the padding versus the margin affects the spacing.",
            "needsVideo": true,
            "videoQuery": "The Box Model and Spacing tutorial",
            "video": {
              "id": "qhiQGPtD1PQ",
              "title": "CSS Box Model Tutorial - Padding, Margin, and Border",
              "channel": "LearnWebCode",
              "url": "https://www.youtube.com/watch?v=qhiQGPtD1PQ",
              "embedUrl": "https://www.youtube.com/embed/qhiQGPtD1PQ",
              "thumbnail": "https://i.ytimg.com/vi/qhiQGPtD1PQ/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          }
        ],
        "quiz": [
          {
            "question": "Which selector targets a single unique element by its id?",
            "options": [
              ".header",
              "p",
              "#header",
              "header"
            ],
            "answerIndex": 2,
            "explanation": "An id selector starts with a hash, so #header targets the one element with id header."
          },
          {
            "question": "What does the background-color property control?",
            "options": [
              "The color of the text",
              "The color behind an element",
              "The size of the font",
              "The thickness of the border"
            ],
            "answerIndex": 1,
            "explanation": "background-color sets the color shown behind an element, while color sets the text color."
          },
          {
            "question": "In the box model, what is padding?",
            "options": [
              "The space outside the border, between elements",
              "The line drawn around an element",
              "The space inside the box, between the content and the edge",
              "The width of the text"
            ],
            "answerIndex": 2,
            "explanation": "Padding is the inner space between an element's content and its edge, inside the border."
          },
          {
            "question": "Why do you list a generic name like sans-serif at the end of a font-family?",
            "options": [
              "It makes the text bold",
              "It is required for the CSS file to load",
              "It acts as a fallback if the listed fonts are unavailable",
              "It changes the text color"
            ],
            "answerIndex": 2,
            "explanation": "The generic family is a fallback the browser uses when none of the named fonts are available."
          }
        ]
      },
      {
        "title": "Layout and Responsive Basics",
        "summary": "Learn to arrange elements with flexbox, make a page adapt to different screen sizes, and combine HTML and CSS into a small finished page.",
        "lessons": [
          {
            "title": "Flexbox: Arranging Items in a Row or Column",
            "objective": "You will be able to use flexbox to lay out a group of items in a row or column and align them.",
            "intro": "For a long time, lining things up side by side in CSS was surprisingly hard. Flexbox is a modern layout tool that makes arranging a group of items into rows or columns simple, and it is the first layout system most beginners should learn.\n\nThis lesson shows how to turn an element into a flex container and control how its children are positioned.",
            "sections": [
              {
                "heading": "The container and its items",
                "body": "Flexbox works on a parent element and its direct children, called the flex items. You turn the parent into a flex container by setting display: flex; on it, and immediately its children line up in a row. For example, three boxes inside a div with display: flex will sit next to each other instead of stacking."
              },
              {
                "heading": "Direction and spacing between items",
                "body": "By default flex items go in a row from left to right, but you can stack them vertically with flex-direction: column;. To put even space between items you can use the gap property, so gap: 16px; adds a consistent 16 pixel gap between each item. This makes it easy to build a navigation bar or a row of cards with neat spacing."
              },
              {
                "heading": "Aligning items",
                "body": "Two properties control alignment: justify-content positions items along the main direction, and align-items positions them across it. For instance, justify-content: space-between; pushes the first and last items to the edges with equal space between the rest, which is perfect for a header with a logo on the left and links on the right. Combining these lets you center content both horizontally and vertically with just a few lines."
              }
            ],
            "keyPoints": [
              "display: flex turns an element into a flex container",
              "Flex items line up in a row by default",
              "flex-direction: column stacks items vertically",
              "gap adds consistent space between flex items",
              "justify-content and align-items control alignment along and across the row"
            ],
            "codeExamples": [
              {
                "language": "css",
                "code": ".nav {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 16px;\n}",
                "caption": "A flex container that spreads items apart, vertically centers them, and adds a gap."
              }
            ],
            "commonMistakes": [
              "Putting display: flex on the items instead of on their parent container",
              "Expecting flex to affect grandchildren, when it only arranges direct children",
              "Confusing justify-content (along the row) with align-items (across the row)"
            ],
            "practice": "Wrap three boxes in a container, set display: flex on the container, and experiment with flex-direction, gap, and justify-content to see how the boxes rearrange.",
            "needsVideo": true,
            "videoQuery": "Flexbox: Arranging Items in a Row or Column tutorial",
            "video": {
              "id": "HZSBE8A9-vY",
              "title": "Learn CSS Flexbox in 10 Minutes | Beginner-Friendly Tutorial 💪",
              "channel": "Kh-CodeStudio",
              "url": "https://www.youtube.com/watch?v=HZSBE8A9-vY",
              "embedUrl": "https://www.youtube.com/embed/HZSBE8A9-vY",
              "thumbnail": "https://i.ytimg.com/vi/HZSBE8A9-vY/hqdefault.jpg",
              "durationSeconds": 600,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Responsive Design with Media Queries",
            "objective": "You will be able to use a media query and flexible sizing so your page adapts to small and large screens.",
            "intro": "People visit websites on phones, tablets, and large monitors, so a good page needs to look right at any size. Responsive design is the practice of building one page that adapts to the screen it is viewed on, instead of making separate sites for each device.\n\nThis lesson introduces the two core tools of responsive design: flexible sizing and the media query.",
            "sections": [
              {
                "heading": "The viewport meta tag",
                "body": "Before anything else, a responsive page needs one line in the head of the HTML: the viewport meta tag. Writing <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> tells phones to render the page at their real width instead of zooming out a desktop layout. Without it, your careful responsive CSS will not work properly on mobile."
              },
              {
                "heading": "Flexible sizes instead of fixed ones",
                "body": "Using percentages or max-width lets elements shrink to fit smaller screens. For example, width: 100%; with max-width: 600px; means an element fills the screen on a phone but never grows wider than 600 pixels on a big monitor. This flexible approach handles most screen sizes before you even reach for a media query."
              },
              {
                "heading": "Media queries for bigger changes",
                "body": "A media query lets you apply CSS only when the screen meets a condition, such as being a certain width. The rule @media (min-width: 768px) { ... } applies its styles only on screens at least 768 pixels wide, so you might stack items in a column on phones and switch to a row on wider screens. This is how you change a layout meaningfully between mobile and desktop."
              }
            ],
            "keyPoints": [
              "A responsive page adapts to any screen size from one codebase",
              "The viewport meta tag is required for responsive layouts on phones",
              "Percentages and max-width create flexible, shrinkable sizing",
              "A media query applies CSS only when a screen condition is met",
              "Use media queries to change layout between mobile and desktop"
            ],
            "codeExamples": [
              {
                "language": "css",
                "code": ".container {\n  width: 100%;\n  max-width: 600px;\n}\n\n@media (min-width: 768px) {\n  .container {\n    display: flex;\n    gap: 24px;\n  }\n}",
                "caption": "A flexible container that becomes a flex row only on screens 768px and wider."
              }
            ],
            "commonMistakes": [
              "Forgetting the viewport meta tag, which breaks responsiveness on phones",
              "Using only fixed pixel widths, so the layout overflows small screens",
              "Writing the media query condition wrong, such as omitting min-width or the units"
            ],
            "practice": "Add the viewport meta tag to your page, give a container width: 100% and max-width, then add a media query that switches it to display: flex above 768px.",
            "needsVideo": true,
            "videoQuery": "Responsive Design with Media Queries tutorial",
            "video": {
              "id": "hbEbk2fcXzM",
              "title": "CSS Media Queries in 15 Minutes | Responsive Design | CSS Tutorial for Beginners",
              "channel": "Dipesh Malvia",
              "url": "https://www.youtube.com/watch?v=hbEbk2fcXzM",
              "embedUrl": "https://www.youtube.com/embed/hbEbk2fcXzM",
              "thumbnail": "https://i.ytimg.com/vi/hbEbk2fcXzM/hqdefault.jpg",
              "durationSeconds": 900,
              "views": 0,
              "publishedAt": ""
            }
          },
          {
            "title": "Putting a Small Page Together",
            "objective": "You will be able to combine HTML structure and CSS styling into one small, responsive page from start to finish.",
            "intro": "You have learned the pieces; now it is time to assemble them into a complete page. Building something end to end is the best way to see how structure, styling, and layout fit together and to build the confidence to make your own sites.\n\nThis lesson walks through a sensible order for putting a small responsive page together and how to check your work.",
            "sections": [
              {
                "heading": "Start with structure, then style",
                "body": "The reliable workflow is to write all your HTML first, focusing only on getting the content and semantic structure right, and then open a separate CSS file to style it. For a simple profile page you might build a header with your name, a main section with a short bio and a photo, and a footer, all before touching a single color. Getting the structure correct first means your styling has a solid foundation to sit on."
              },
              {
                "heading": "Layout and responsiveness last",
                "body": "Once the content looks reasonable, use flexbox to arrange groups of items and add a media query to adapt the layout for larger screens. You might let sections stack in a single column on a phone and then place the photo beside the bio in a flex row on a wide screen. Doing layout after the basic styling keeps each step focused and easier to debug."
              },
              {
                "heading": "Test and refine in the browser",
                "body": "Open your page in a browser and use the developer tools, opened by pressing F12, to inspect elements and shrink the window to test small screens. When something looks off, check the box model panel to see whether the issue is padding, margin, or border, and adjust one property at a time. Building, viewing, and tweaking in this loop is exactly how professional developers work."
              }
            ],
            "keyPoints": [
              "Write HTML structure first, then style with CSS, then handle layout",
              "Use semantic elements to organize a real page like a profile",
              "Apply flexbox and a media query so the page adapts to screen size",
              "Test in the browser and use developer tools to inspect problems",
              "Change one property at a time when debugging spacing issues"
            ],
            "codeExamples": [
              {
                "language": "html",
                "code": "<header><h1>Jane Doe</h1></header>\n<main class=\"profile\">\n  <img src=\"me.jpg\" alt=\"Photo of Jane\">\n  <p>I am a beginner web developer learning HTML and CSS.</p>\n</main>\n<footer><p>Made with HTML and CSS</p></footer>",
                "caption": "A small semantic profile page ready to be styled and made responsive."
              }
            ],
            "commonMistakes": [
              "Styling before the HTML structure is finished, leading to constant rework",
              "Skipping testing on a narrow screen, so mobile problems go unnoticed",
              "Changing many CSS properties at once, making it hard to tell what fixed or broke the layout"
            ],
            "practice": "Build a one page profile of yourself with a header, a main section containing a photo and a short bio, and a footer, then style it and add a media query so the photo sits beside the bio on wide screens.",
            "needsVideo": true,
            "videoQuery": "Putting a Small Page Together tutorial",
            "video": {
              "id": "ZPMtug9qExk",
              "title": "Build a Personal Website with HTML & CSS (Beginner Crash Course)",
              "channel": "Coding2GO",
              "url": "https://www.youtube.com/watch?v=ZPMtug9qExk",
              "embedUrl": "https://www.youtube.com/embed/ZPMtug9qExk",
              "thumbnail": "https://i.ytimg.com/vi/ZPMtug9qExk/hqdefault.jpg",
              "durationSeconds": 0,
              "views": 0,
              "publishedAt": ""
            }
          }
        ],
        "quiz": [
          {
            "question": "Which CSS declaration turns an element into a flex container?",
            "options": [
              "display: flex;",
              "flex: container;",
              "layout: flex;",
              "position: flex;"
            ],
            "answerIndex": 0,
            "explanation": "Setting display: flex on a parent makes it a flex container and arranges its direct children."
          },
          {
            "question": "What does the media query @media (min-width: 768px) do?",
            "options": [
              "Applies its styles only on screens narrower than 768px",
              "Applies its styles only on screens at least 768px wide",
              "Sets every element to 768px wide",
              "Hides the page below 768px"
            ],
            "answerIndex": 1,
            "explanation": "A min-width media query applies its styles only when the screen is at least that width."
          },
          {
            "question": "Why is the viewport meta tag important for responsive design?",
            "options": [
              "It changes the page font",
              "It tells phones to render the page at their real width instead of zooming out",
              "It links the CSS file to the page",
              "It centers all the content"
            ],
            "answerIndex": 1,
            "explanation": "The viewport meta tag makes mobile browsers use the device's real width so responsive CSS works as intended."
          },
          {
            "question": "What is the recommended order for building a small page?",
            "options": [
              "Layout first, then HTML, then colors",
              "CSS first, then HTML",
              "HTML structure first, then styling, then layout and responsiveness",
              "All at the same time in one file"
            ],
            "answerIndex": 2,
            "explanation": "Writing the HTML structure first gives styling and layout a solid foundation and makes each step easier to debug."
          }
        ]
      }
    ]
  }
];
