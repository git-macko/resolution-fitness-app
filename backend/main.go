// Package main — Entry point for the Resolution Fitness App backend server.
// This file wires together all the components: config, database,
// middleware, and handlers. It then starts the HTTP server.
//
// The architecture follows a simple layered pattern:
//   main.go → config → database → middleware → handlers
//
// All handlers are registered here with their HTTP method + path patterns
// using Go 1.22+ enhanced ServeMux routing.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"resolution-fitnessapp-backend/config"
	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/handlers"
	"resolution-fitnessapp-backend/middleware"
)

func main() {
	// ── Step 1: Load configuration from environment ───────────────
	cfg := config.Load()
	log.Printf("Configuration loaded (port: %s)", cfg.Port)

	// ── Step 2: Initialize database with migrations ───────────────
	if err := database.Initialize(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// ── Step 3: Initialize auth & middleware ──────────────────────
	handlers.InitAuth(cfg.JWTSecret)
	middleware.InitMiddleware(cfg.JWTSecret)

	// ── Step 4: Seed the database with initial data ───────────────
	// Exercises, motivational quotes, and health facts are seeded
	// automatically on first run (checked by watching for empty tables).
	seedDatabase()

	// ── Step 5: Create the router ─────────────────────────────────
	// Go 1.22+ ServeMux supports method-based routing.
	// Pattern format: "METHOD /path" or "METHOD /path/{param}"
	mux := http.NewServeMux()

	// --- Public routes (no authentication required) ---
	mux.HandleFunc("GET /api/health", handlers.HealthCheck)

	// --- Auth routes (public) ---
	mux.HandleFunc("POST /api/auth/register", handlers.Register)
	mux.HandleFunc("POST /api/auth/login", handlers.Login)
	mux.HandleFunc("POST /api/auth/refresh", withAuth(handlers.RefreshToken))

	// --- Profile routes (protected) ---
	mux.Handle("GET /api/profile", protect(handlers.GetProfile))
	mux.Handle("PUT /api/profile", protect(handlers.UpdateProfile))
	mux.Handle("POST /api/profile/picture", protect(handlers.UploadProfilePic))
	mux.Handle("GET /api/profile/settings", protect(handlers.GetSettings))
	mux.Handle("PUT /api/profile/settings", protect(handlers.UpdateSettings))
	mux.Handle("DELETE /api/profile", protect(handlers.DeleteAccount))
	mux.Handle("POST /api/profile/onboarding", protect(handlers.CompleteOnboarding))

	// --- Exercise Library routes ---
	mux.HandleFunc("GET /api/exercises", handlers.GetExercises)
	mux.HandleFunc("GET /api/exercises/{exerciseId}", handlers.GetExercise)

	// --- Weekly Plans routes (protected) ---
	mux.Handle("GET /api/plans", protect(handlers.GetPlans))
	mux.Handle("POST /api/plans", protect(handlers.CreatePlan))
	mux.Handle("GET /api/plans/{planId}", protect(handlers.GetPlan))
	mux.Handle("PUT /api/plans/{planId}", protect(handlers.UpdatePlan))
	mux.Handle("DELETE /api/plans/{planId}", protect(handlers.DeletePlan))
	mux.Handle("POST /api/plans/{planId}/clone", protect(handlers.ClonePlan))
	mux.Handle("POST /api/plans/{planId}/activate", protect(handlers.SetActivePlan))

	// --- Workout Templates ---
	mux.HandleFunc("GET /api/workout-templates", handlers.GetWorkoutTemplates)

	// --- Workout Sessions routes (protected) ---
	mux.Handle("POST /api/workouts", protect(handlers.StartWorkout))
	mux.Handle("GET /api/workouts/{sessionId}", protect(handlers.GetWorkoutSession))
	mux.Handle("PUT /api/workouts/{sessionId}", protect(handlers.UpdateWorkoutSession))
	mux.Handle("POST /api/workouts/{sessionId}/complete", protect(handlers.CompleteWorkout))
	mux.Handle("POST /api/workouts/{sessionId}/cancel", protect(handlers.CancelWorkout))
	mux.Handle("GET /api/workouts/history", protect(handlers.GetWorkoutHistory))

	// --- Nutrition routes (protected) ---
	mux.Handle("GET /api/nutrition/daily", protect(handlers.GetDailyNutrition))
	mux.Handle("POST /api/nutrition/meals", protect(handlers.CreateMeal))
	mux.Handle("PUT /api/nutrition/meals/{mealId}", protect(handlers.UpdateMeal))
	mux.Handle("DELETE /api/nutrition/meals/{mealId}", protect(handlers.DeleteMeal))
	mux.Handle("POST /api/nutrition/water", protect(handlers.LogWater))
	mux.Handle("GET /api/nutrition/weekly", protect(handlers.GetWeeklyNutrition))
	mux.Handle("GET /api/nutrition/suggestions", protect(handlers.GetMealSuggestions))

	// --- Food Scanner routes (protected) ---
	mux.Handle("POST /api/food-scan", protect(handlers.ScanFood))
	mux.Handle("POST /api/food-scan/log", protect(handlers.LogScannedFood))
	mux.Handle("GET /api/food-scan/history", protect(handlers.GetScanHistory))

	// --- Weight Tracking routes (protected) ---
	mux.Handle("GET /api/weight", protect(handlers.GetWeightLogs))
	mux.Handle("POST /api/weight", protect(handlers.LogWeight))
	mux.Handle("DELETE /api/weight/{logId}", protect(handlers.DeleteWeightLog))

	// --- Body Measurements routes (protected) ---
	mux.Handle("GET /api/measurements", protect(handlers.GetMeasurements))
	mux.Handle("POST /api/measurements", protect(handlers.LogMeasurements))

	// --- Sleep Tracking routes (protected) ---
	mux.Handle("GET /api/sleep", protect(handlers.GetSleepLogs))
	mux.Handle("POST /api/sleep", protect(handlers.LogSleep))

	// --- Dashboard route (protected) ---
	mux.Handle("GET /api/dashboard", protect(handlers.GetDashboard))

	// --- AI Chat routes (protected) ---
	mux.Handle("POST /api/chat", protect(handlers.Chat))
	mux.Handle("GET /api/chat/history", protect(handlers.GetChatHistory))
	mux.Handle("GET /api/chat/suggestions", protect(handlers.GetChatSuggestions))
	mux.Handle("DELETE /api/chat/history", protect(handlers.ClearChatHistory))

	// --- Static file serving for uploads ---
	// Files uploaded by users (profile pics, food photos) are served publicly.
	fileServer := http.FileServer(http.Dir("./uploads"))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", fileServer))

	// ── Step 6: Apply middleware chain ────────────────────────────
	// Outer: CORS → RequestLogger → Inner: Actual router
	handler := middleware.CORS(middleware.RequestLogger(mux))

	// ── Step 7: Start the server ──────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("🚀 Resolution Fitness API starting on http://localhost%s", addr)
	log.Printf("📋 API Documentation: See PROMPT.md for all endpoints")
	log.Printf("💡 Health check: http://localhost%s/api/health", addr)

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

// ── Middleware Wrappers ──────────────────────────────────────────────

// protect is a shorthand for wrapping a handler with AuthRequired middleware.
// It validates the JWT token, extracts the user ID, and injects it into context.
func protect(handler http.HandlerFunc) http.Handler {
	return middleware.AuthRequired(handler)
}

// withAuth is like protect but returns an http.HandlerFunc for route registration.
func withAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		middleware.AuthRequired(handler).ServeHTTP(w, r)
	}
}

// ── Database Seeding ─────────────────────────────────────────────────
// seedDatabase populates the database with initial data (exercises, quotes,
// health facts) if the tables are empty. This runs on every server start.
func seedDatabase() {
	var count int

	// ── Seed exercises if table is empty ──────────────────────────
	database.DB.QueryRow("SELECT COUNT(*) FROM exercises").Scan(&count)
	if count == 0 {
		seedExercises()
		log.Printf("🌱 Seeded %d exercises", countAfter("exercises"))
	}

	// ── Seed motivational quotes if table is empty ────────────────
	database.DB.QueryRow("SELECT COUNT(*) FROM daily_quotes").Scan(&count)
	if count == 0 {
		seedQuotes()
		log.Printf("💬 Seeded %d motivational quotes", countAfter("daily_quotes"))
	}

	// ── Seed health facts if table is empty ───────────────────────
	database.DB.QueryRow("SELECT COUNT(*) FROM health_facts").Scan(&count)
	if count == 0 {
		seedHealthFacts()
		log.Printf("🧠 Seeded %d health facts", countAfter("health_facts"))
	}
}

// countAfter returns the number of rows in a table (used for logging after seed).
func countAfter(table string) int {
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count)
	return count
}

// seedExercises inserts the exercise library (40+ exercises across all muscle groups).
func seedExercises() {
	type exercise struct {
		Name, Group, Equipment, Desc string
		Instructions, Tips, Mistakes []string
	}
	exercises := []exercise{
		// ── Chest ──────────────────────────────────────────────────
		{Name: "Bench Press", Group: "chest", Equipment: "Barbell",
			Desc: "Lie on a flat bench, grip the bar slightly wider than shoulder-width, lower to chest, press up.",
			Instructions: []string{"Lie flat on the bench with feet planted", "Grip bar wider than shoulder-width", "Unrack and lower bar to mid-chest", "Press back up to full arm extension"},
			Tips:         []string{"Keep shoulder blades retracted", "Drive through your heels", "Don't bounce the bar off your chest"},
			Mistakes:     []string{"Flaring elbows too wide", "Not touching chest", "Uneven grip"},
		},
		{Name: "Incline Dumbbell Press", Group: "chest", Equipment: "Dumbbell",
			Desc: "On an incline bench (30-45°), press dumbbells from shoulder height to full extension.",
			Instructions: []string{"Set bench to 30-45 degrees", "Hold dumbbells at shoulder height", "Press up until arms extended", "Lower with control"},
			Tips:         []string{"Don't go too steep — it shifts to shoulders", "Keep wrists neutral", "Squeeze at the top"},
		},
		{Name: "Dumbbell Fly", Group: "chest", Equipment: "Dumbbell",
			Desc: "Lie on a flat bench, arms extended above chest, lower dumbbells in an arc to the sides, then bring back together.",
			Instructions: []string{"Lie flat holding dumbbells above chest", "Slight bend in elbows", "Lower dumbbells in a wide arc", "Bring back together squeezing chest"},
			Tips:         []string{"Keep the elbow angle constant", "Don't go too heavy — isolates chest", "Feel the stretch"},
		},
		{Name: "Push-ups", Group: "chest", Equipment: "Bodyweight",
			Desc: "Bodyweight exercise. Hands shoulder-width apart, lower body until chest nearly touches ground, push back up.",
			Instructions: []string{"Plank position, hands under shoulders", "Lower body keeping core tight", "Push back up explosively"},
			Tips:         []string{"Keep body in a straight line", "Don't let hips sag", "Vary hand position for different emphasis"},
		},
		// ── Back ───────────────────────────────────────────────────
		{Name: "Deadlift", Group: "back", Equipment: "Barbell",
			Desc: "Stand with feet hip-width, grip bar just outside legs, lift by extending hips and knees simultaneously.",
			Instructions: []string{"Stand with mid-foot under bar", "Hinge at hips and grip bar", "Keep back flat, chest up", "Drive through heels to stand", "Lower with control"},
			Tips:         []string{"Keep the bar close to your body", "Don't round your back", "Engage lats before lifting"},
		},
		{Name: "Pull-ups", Group: "back", Equipment: "Bodyweight",
			Desc: "Hang from a bar with overhand grip, pull yourself up until chin clears the bar.",
			Instructions: []string{"Grip bar slightly wider than shoulder-width", "Hang with arms fully extended", "Pull up leading with elbows", "Chin over bar, then lower with control"},
			Tips:         []string{"Don't kip (use momentum)", "Engage your core", "Full range of motion is key"},
		},
		{Name: "Barbell Row", Group: "back", Equipment: "Barbell",
			Desc: "Hinge forward at hips, pull barbell to lower chest/upper abs, squeeze back muscles.",
			Instructions: []string{"Hinge forward 45-60 degrees", "Grip bar slightly wider than shoulder-width", "Pull bar to lower chest", "Lower with control"},
			Tips:         []string{"Keep your back flat (not rounded)", "Pull with elbows, not biceps", "Don't use momentum"},
		},
		{Name: "Lat Pulldown", Group: "back", Equipment: "Cable",
			Desc: "Sit at cable machine, pull bar down to upper chest while keeping back straight.",
			Instructions: []string{"Grip wide overhead bar", "Lean back slightly", "Pull bar to upper chest", "Control the return"},
			Tips:         []string{"Don't lean too far back", "Squeeze shoulder blades together", "Full stretch at top"},
		},
		// ── Legs ───────────────────────────────────────────────────
		{Name: "Squat", Group: "legs", Equipment: "Barbell",
			Desc: "Barbell across upper back, squat down until thighs are parallel to ground, then stand back up.",
			Instructions: []string{"Position bar on upper traps", "Unrack and step back", "Squat to parallel or below", "Drive through heels to stand"},
			Tips:         []string{"Keep chest up", "Knees track over toes", "Maintain neutral spine"},
		},
		{Name: "Romanian Deadlift", Group: "legs", Equipment: "Barbell",
			Desc: "Stand holding barbell, hinge at hips while keeping legs mostly straight, lower bar to shins, return to standing.",
			Instructions: []string{"Stand with feet hip-width", "Soft knee bend", "Hinge at hips, push butt back", "Lower until hamstring stretch", "Return by driving hips forward"},
			Tips:         []string{"Keep bar close to legs", "Don't round your back", "Feel the hamstring stretch"},
		},
		{Name: "Leg Press", Group: "legs", Equipment: "Machine",
			Desc: "Sit in leg press machine, push platform away with feet, then return with control.",
			Instructions: []string{"Place feet shoulder-width on platform", "Release safety handles", "Lower until knees are at 90°", "Press back to starting position"},
			Tips:         []string{"Don't lock out knees at top", "Keep back flat against pad", "Control the descent"},
		},
		{Name: "Calf Raise", Group: "legs", Equipment: "Machine",
			Desc: "Stand on calf raise machine, lower heels, then raise up onto toes.",
			Instructions: []string{"Place shoulders under pads", "Balls of feet on platform", "Lower heels for stretch", "Raise up as high as possible"},
			Tips:         []string{"Full range of motion", "Pause at top and bottom", "High reps work best"},
		},
		{Name: "Front Squat", Group: "legs", Equipment: "Barbell",
			Desc: "Barbell rests on front deltoids/clavicle, squat down maintaining upright torso.",
			Instructions: []string{"Rest bar on front delts, elbows up", "Maintain upright torso", "Squat to parallel", "Drive up"},
		},
		{Name: "Bulgarian Split Squat", Group: "legs", Equipment: "Dumbbell",
			Desc: "Rear foot elevated on bench, front foot forward, lower into a lunge position.",
			Instructions: []string{"Place rear foot on bench behind you", "Dumbbells at sides", "Lower until front thigh is parallel", "Drive through front heel"},
		},
		// ── Shoulders ──────────────────────────────────────────────
		{Name: "Overhead Press", Group: "shoulders", Equipment: "Barbell",
			Desc: "Stand with barbell at shoulder height, press directly overhead until arms are locked.",
			Instructions: []string{"Grip bar slightly wider than shoulders", "Bar resting on front delts", "Press overhead in straight line", "Lock out at top"},
			Tips:         []string{"Keep core tight", "Don't lean back excessively", "Head moves back, then forward"},
		},
		{Name: "Lateral Raise", Group: "shoulders", Equipment: "Dumbbell",
			Desc: "Stand holding dumbbells at sides, raise arms out to sides until parallel with floor.",
			Instructions: []string{"Dumbbells at sides, slight bend in elbows", "Raise arms laterally to shoulder height", "Pause at top", "Lower with control"},
			Tips:         []string{"Don't use momentum (no swinging!)", "Lead with elbows, not hands", "Light weight, high reps"},
		},
		{Name: "Face Pull", Group: "shoulders", Equipment: "Cable",
			Desc: "Pull cable rope attachment toward face, externally rotating and squeezing rear delts.",
			Instructions: []string{"Set cable at upper chest height", "Grip rope with both hands", "Pull toward face, elbows high", "Squeeze rear delts and rhomboids"},
		},
		// ── Arms ───────────────────────────────────────────────────
		{Name: "Bicep Curl", Group: "arms", Equipment: "Dumbbell",
			Desc: "Stand holding dumbbells, curl weight up toward shoulders, squeeze biceps, lower with control.",
			Instructions: []string{"Stand with dumbbells at sides, palms forward", "Curl weights up, elbows fixed", "Squeeze at top", "Lower slowly"},
			Tips:         []string{"Don't swing your body", "Full range of motion", "Control the negative"},
		},
		{Name: "Tricep Pushdown", Group: "arms", Equipment: "Cable",
			Desc: "Stand at cable machine with rope/bar attachment, push down until arms are fully extended.",
			Instructions: []string{"Grip rope/bar at chest height", "Elbows tucked at sides", "Push down until arms straight", "Return slowly"},
			Tips:         []string{"Keep elbows pinned to sides", "Don't lean over the cable", "Full extension at bottom"},
		},
		{Name: "Hammer Curl", Group: "arms", Equipment: "Dumbbell",
			Desc: "Like bicep curl but with neutral (hammer) grip — palms facing each other.",
			Instructions: []string{"Dumbbells at sides, neutral grip", "Curl up keeping palms facing in", "Squeeze at top", "Lower slowly"},
		},
		{Name: "Skull Crusher", Group: "arms", Equipment: "Barbell",
			Desc: "Lie on bench, lower barbell toward forehead by bending elbows, extend back up for tricep isolation.",
			Instructions: []string{"Lie flat, barbell above chest", "Lower bar toward forehead", "Extend back up", "Elbows pointed up, not out"},
		},
		// ── Core ───────────────────────────────────────────────────
		{Name: "Plank", Group: "core", Equipment: "Bodyweight",
			Desc: "Hold a push-up position with body in a straight line from head to heels.",
			Instructions: []string{"Forearms on ground, elbows under shoulders", "Legs straight, toes on ground", "Hold body in straight line", "Breathe steadily"},
			Tips:         []string{"Don't let hips sag", "Engage glutes and abs", "Start with 30s, build up"},
		},
		{Name: "Hanging Leg Raise", Group: "core", Equipment: "Bodyweight",
			Desc: "Hang from a pull-up bar, raise legs until parallel with floor (or higher), lower with control.",
			Instructions: []string{"Hang from bar with straight arms", "Raise legs keeping them straight", "Lower with control", "Avoid swinging"},
		},
		// ── Cardio ─────────────────────────────────────────────────
		{Name: "Running (Treadmill)", Group: "cardio", Equipment: "Machine",
			Desc: "Cardiovascular exercise on a treadmill. Adjust speed and incline.",
			Instructions: []string{"Start with 5-min warm-up walk", "Gradually increase speed", "Maintain steady pace 20-40 min", "Cool down with 5-min walk"},
		},
		{Name: "Jump Rope", Group: "cardio", Equipment: "Bodyweight",
			Desc: "Classic cardio exercise using a jump rope for high-intensity calorie burn.",
			Instructions: []string{"Hold rope handles, rope behind heels", "Swing rope overhead and jump", "Land softly on balls of feet", "Maintain steady rhythm"},
		},
		{Name: "Burpees", Group: "cardio", Equipment: "Bodyweight",
			Desc: "Full-body explosive movement: squat → plank → push-up → jump.",
			Instructions: []string{"Start standing", "Drop into squat, hands on ground", "Kick feet back to plank", "Optional push-up", "Jump feet forward, explosive jump up"},
		},
		{Name: "Rowing Machine", Group: "cardio", Equipment: "Machine",
			Desc: "Full-body cardio on a rowing ergometer.",
			Instructions: []string{"Strap feet in, grip handle", "Drive with legs first", "Then lean back and pull to chest", "Recover: arms, body, legs"},
		},
	}

	for i, ex := range exercises {
		// Use sequential numeric IDs for deterministic seeding
		instJSON, err := json.Marshal(ex.Instructions)
		if err != nil {
			log.Printf("WARNING: failed to marshal instructions for %s: %v", ex.Name, err)
			continue
		}
		tipsJSON, err := json.Marshal(ex.Tips)
		if err != nil {
			log.Printf("WARNING: failed to marshal tips for %s: %v", ex.Name, err)
			continue
		}
		mistakesJSON, err := json.Marshal(ex.Mistakes)
		if err != nil {
			log.Printf("WARNING: failed to marshal mistakes for %s: %v", ex.Name, err)
			continue
		}
		realID := fmt.Sprintf("ex-%03d", i)

		database.DB.Exec(`
			INSERT OR IGNORE INTO exercises (id, name, muscle_group, equipment, description, instructions, tips, common_mistakes, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		`, realID, ex.Name, ex.Group, ex.Equipment, ex.Desc, instJSON, tipsJSON, mistakesJSON)
	}
}

// seedQuotes inserts 20+ motivational quotes.
func seedQuotes() {
	quotes := []struct{ Text, Author, Category string }{
		{"The only bad workout is the one that didn't happen.", "Unknown", "motivation"},
		{"Strength does not come from the body. It comes from the will.", "Unknown", "mindset"},
		{"The pain you feel today will be the strength you feel tomorrow.", "Arnold Schwarzenegger", "motivation"},
		{"Don't limit your challenges. Challenge your limits.", "Unknown", "mindset"},
		{"Your body can stand almost anything. It's your mind you have to convince.", "Unknown", "mindset"},
		{"Success starts with self-discipline.", "Unknown", "discipline"},
		{"The hardest lift is lifting your butt off the couch.", "Unknown", "motivation"},
		{"Wake up with determination. Go to bed with satisfaction.", "Unknown", "discipline"},
		{"It never gets easier. You just get stronger.", "Unknown", "motivation"},
		{"The only way to do great work is to love what you do.", "Steve Jobs", "mindset"},
		{"Discipline is the bridge between goals and accomplishment.", "Jim Rohn", "discipline"},
		{"You don't have to be extreme, just consistent.", "Unknown", "discipline"},
		{"Fall in love with taking care of yourself.", "Unknown", "health"},
		{"A one-hour workout is 4% of your day. No excuses.", "Unknown", "motivation"},
		{"The body achieves what the mind believes.", "Napoleon Hill", "mindset"},
		{"Sweat is just fat crying.", "Unknown", "motivation"},
		{"What seems impossible today will one day be your warm-up.", "Unknown", "motivation"},
		{"Strive for progress, not perfection.", "Unknown", "mindset"},
		{"If it doesn't challenge you, it doesn't change you.", "Fred DeVito", "motivation"},
		{"Take care of your body. It's the only place you have to live.", "Jim Rohn", "health"},
		{"No matter how slow you go, you're still lapping everyone on the couch.", "Unknown", "motivation"},
	}

	for i, q := range quotes {
		id := fmt.Sprintf("quote-%03d", i)
		database.DB.Exec(`
			INSERT OR IGNORE INTO daily_quotes (id, text, author, category, created_at)
			VALUES (?, ?, ?, ?, datetime('now'))
		`, id, q.Text, q.Author, q.Category)
	}
}

// seedHealthFacts inserts 20+ health and gym science facts.
func seedHealthFacts() {
	facts := []struct{ Text, Category, Source string }{
		{"Drinking water can boost your metabolism by up to 30% for about an hour.", "nutrition", "Journal of Clinical Endocrinology"},
		{"Your muscles continue to burn calories for up to 48 hours after a workout due to EPOC (excess post-exercise oxygen consumption).", "exercise_science", "Journal of Sports Science"},
		{"Sleep is when your body produces the most growth hormone, which is essential for muscle repair.", "recovery", "Sleep Medicine Reviews"},
		{"Protein consumed within 30 minutes after a workout is absorbed up to 50% more efficiently.", "nutrition", "American Journal of Clinical Nutrition"},
		{"Walking 10,000 steps a day burns roughly 300-500 calories depending on body weight.", "exercise_science", "Mayo Clinic"},
		{"Muscle mass burns more calories at rest than fat — 1kg of muscle burns ~13 calories/day, while 1kg of fat burns ~4.", "exercise_science", "Journal of Applied Physiology"},
		{"Stretching before bed can improve sleep quality by up to 30%.", "recovery", "Sleep Health Journal"},
		{"The 'pump' you feel during a workout is blood rushing to the muscle, bringing oxygen and nutrients.", "exercise_science", "Physiology Journal"},
		{"Dehydration of just 2% can reduce physical performance by up to 20%.", "nutrition", "Sports Medicine"},
		{"Consistent resistance training can increase bone density, reducing osteoporosis risk.", "exercise_science", "Journal of Bone Health"},
		{"Eating carbs before a workout improves performance by 10-20% in sessions over 60 minutes.", "nutrition", "International Society of Sports Nutrition"},
		{"The average person loses 1-2 liters of water during a one-hour intense workout.", "nutrition", "Sports Medicine"},
		{"High-intensity interval training (HIIT) can burn fat for up to 24 hours after the workout ends.", "exercise_science", "Journal of Obesity"},
		{"Creatine is one of the most researched supplements — proven to increase strength by 5-15%.", "nutrition", "Journal of Strength and Conditioning"},
		{"Cold exposure (cold showers) can boost metabolism by activating brown fat tissue.", "recovery", "Cell Metabolism"},
		{"The human body has over 650 muscles — you use about 200 of them just to take one step.", "exercise_science", "Anatomy & Physiology"},
		{"Regular exercise can reduce symptoms of anxiety and depression by 20-30%.", "mindset", "The Lancet Psychiatry"},
		{"Eating protein throughout the day (vs all at once) leads to better muscle protein synthesis.", "nutrition", "Journal of Nutrition"},
		{"Foam rolling after a workout can reduce muscle soreness (DOMS) by up to 40%.", "recovery", "Journal of Athletic Training"},
		{"Your grip strength is correlated with overall longevity and healthspan.", "exercise_science", "The Lancet"},
	}

	for i, f := range facts {
		id := fmt.Sprintf("fact-%03d", i)
		database.DB.Exec(`
			INSERT OR IGNORE INTO health_facts (id, text, category, source, created_at)
			VALUES (?, ?, ?, ?, datetime('now'))
		`, id, f.Text, f.Category, f.Source)
	}
}

// ── Small helpers for seeding ────────────────────────────────────────
// (json.Marshal and the built-in min/max are used directly above)
