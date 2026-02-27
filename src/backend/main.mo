import Map "mo:core/Map";
import List "mo:core/List";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Array "mo:core/Array";
import Principal "mo:core/Principal";

actor {
  type UserProfile = {
    name : Text;
    age : Nat;
    gender : Text;
    heightCm : Float;
    weightKg : Float;
    updatedAt : Int;
  };

  type FoodLog = {
    id : Text;
    date : Text;
    foodName : Text;
    grams : Float;
    caloriesPer100g : Float;
    totalCalories : Float;
    mealType : Text;
  };

  type WorkoutLog = {
    id : Text;
    date : Text;
    workoutName : Text;
    durationMinutes : Nat;
    caloriesBurned : Float;
  };

  type WeightEntry = {
    id : Text;
    date : Text;
    weightKg : Float;
    bmi : Float;
  };

  stable var profiles = Map.empty<Principal, UserProfile>();
  stable var foodLogs = Map.empty<Principal, List.List<FoodLog>>();
  stable var workoutLogs = Map.empty<Principal, List.List<WorkoutLog>>();
  stable var weightEntries = Map.empty<Principal, List.List<WeightEntry>>();

  public shared ({ caller }) func setProfile(profile : UserProfile) : async () {
    profiles.add(caller, profile);
  };

  public query ({ caller }) func getProfile() : async ?UserProfile {
    profiles.get(caller);
  };

  public shared ({ caller }) func addFoodLog(log : FoodLog) : async () {
    let existingLogs = switch (foodLogs.get(caller)) {
      case (null) { List.empty<FoodLog>() };
      case (?logs) { logs };
    };
    existingLogs.add(log);
    foodLogs.add(caller, existingLogs);
  };

  public query ({ caller }) func getFoodLogs(date : Text) : async [FoodLog] {
    switch (foodLogs.get(caller)) {
      case (null) { [] };
      case (?logs) {
        logs.filter(
          func(log) { log.date == date }
        ).toArray();
      };
    };
  };

  public query ({ caller }) func getAllFoodLogs() : async [FoodLog] {
    switch (foodLogs.get(caller)) {
      case (null) { [] };
      case (?logs) { logs.toArray() };
    };
  };

  public shared ({ caller }) func deleteFoodLog(id : Text) : async () {
    switch (foodLogs.get(caller)) {
      case (null) { Runtime.trap("No food logs found") };
      case (?logs) {
        let filteredLogs = logs.filter(
          func(log) { log.id != id }
        );
        foodLogs.add(caller, filteredLogs);
      };
    };
  };

  public shared ({ caller }) func addWorkoutLog(log : WorkoutLog) : async () {
    let existingLogs = switch (workoutLogs.get(caller)) {
      case (null) { List.empty<WorkoutLog>() };
      case (?logs) { logs };
    };
    existingLogs.add(log);
    workoutLogs.add(caller, existingLogs);
  };

  public query ({ caller }) func getWorkoutLogs(date : Text) : async [WorkoutLog] {
    switch (workoutLogs.get(caller)) {
      case (null) { [] };
      case (?logs) {
        logs.filter(
          func(log) { log.date == date }
        ).toArray();
      };
    };
  };

  public query ({ caller }) func getAllWorkoutLogs() : async [WorkoutLog] {
    switch (workoutLogs.get(caller)) {
      case (null) { [] };
      case (?logs) { logs.toArray() };
    };
  };

  public shared ({ caller }) func deleteWorkoutLog(id : Text) : async () {
    switch (workoutLogs.get(caller)) {
      case (null) { Runtime.trap("No workout logs found") };
      case (?logs) {
        let filteredLogs = logs.filter(
          func(log) { log.id != id }
        );
        workoutLogs.add(caller, filteredLogs);
      };
    };
  };

  public shared ({ caller }) func addWeightEntry(entry : WeightEntry) : async () {
    let existingEntries = switch (weightEntries.get(caller)) {
      case (null) { List.empty<WeightEntry>() };
      case (?entries) { entries };
    };
    existingEntries.add(entry);
    weightEntries.add(caller, existingEntries);
  };

  public query ({ caller }) func getWeightEntries() : async [WeightEntry] {
    switch (weightEntries.get(caller)) {
      case (null) { [] };
      case (?entries) { entries.toArray() };
    };
  };

  public shared ({ caller }) func deleteWeightEntry(id : Text) : async () {
    switch (weightEntries.get(caller)) {
      case (null) { Runtime.trap("No weight entries found") };
      case (?entries) {
        let filteredEntries = entries.filter(
          func(entry) { entry.id != id }
        );
        weightEntries.add(caller, filteredEntries);
      };
    };
  };
};
