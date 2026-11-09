#include <discordpp.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <iostream>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

using json = nlohmann::json;
namespace {
std::mutex queueMutex;
std::vector<json> commands;
std::atomic<bool> running{true};
void emit(json value) { std::cout << value.dump() << std::endl; }
std::optional<std::string> optionalString(const json& value, const char* key) {
  if (!value.contains(key) || !value[key].is_string() || value[key].get<std::string>().empty()) return std::nullopt;
  return value[key].get<std::string>();
}
void setActivity(discordpp::Client& client, const json& profile) {
  discordpp::Activity activity;
  activity.SetName(profile.value("name", std::string("Custom activity")));
  activity.SetType(discordpp::ActivityTypes::Playing);
  activity.SetDetails(optionalString(profile, "details"));
  activity.SetState(optionalString(profile, "state"));
  discordpp::ActivityAssets assets;
  assets.SetLargeImage(optionalString(profile, "largeImage"));
  assets.SetLargeText(optionalString(profile, "largeText"));
  assets.SetSmallImage(optionalString(profile, "smallImage"));
  assets.SetSmallText(optionalString(profile, "smallText"));
  activity.SetAssets(std::move(assets));
  const auto now = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();
  discordpp::ActivityTimestamps timestamps;
  const auto start = profile.value("startAt", int64_t{0});
  timestamps.SetStart(start > 0 ? static_cast<uint64_t>(start) : static_cast<uint64_t>(now));
  activity.SetTimestamps(std::move(timestamps));
  if (profile.contains("partySize") && profile.value("partySize", 0) > 0) {
    discordpp::ActivityParty party;
    auto id = profile.value("partyId", std::string("presence-cloud"));
    if (id.size() < 2) id = "presence-cloud";
    party.SetId(id);
    party.SetCurrentSize(profile.value("partySize", 1));
    party.SetMaxSize(profile.value("partyMax", 0));
    activity.SetParty(std::move(party));
  }
  if (profile.contains("buttons") && profile["buttons"].is_array()) {
    for (const auto& item : profile["buttons"]) {
      const auto label = item.value("label", std::string());
      const auto url = item.value("url", std::string());
      if (label.empty() || url.empty()) continue;
      discordpp::ActivityButton button;
      button.SetLabel(label);
      button.SetUrl(url);
      activity.AddButton(std::move(button));
    }
  }
  client.UpdateRichPresence(std::move(activity), [](discordpp::ClientResult result) {
    emit({{"event", result.Successful() ? "presence_updated" : "presence_error"},
          {"message", result.Successful() ? "Rich Presence updated" : result.Error()}});
  });
}
}
int main(int argc, char** argv) {
  if (argc != 2) { std::cerr << "Usage: presence-worker <discord-application-id>\n"; return 2; }
  uint64_t appId = 0;
  try { appId = std::stoull(argv[1]); } catch (...) { std::cerr << "Invalid Discord application id\n"; return 2; }
  std::thread input([] {
    std::string line;
    while (running && std::getline(std::cin, line)) {
      try { std::lock_guard<std::mutex> lock(queueMutex); commands.push_back(json::parse(line)); }
      catch (...) { emit({{"event", "command_error"}, {"message", "Invalid command JSON"}}); }
    }
    running = false;
  });
  discordpp::Client client;
  client.SetApplicationId(appId);
  client.SetStatusChangedCallback([](discordpp::Client::Status status, discordpp::Client::Error error, int32_t errorDetail) {
    emit({{"event", "connection"}, {"status", static_cast<int>(status)}, {"error", static_cast<int>(error)}, {"detail", errorDetail}});
  });
  bool connected = false;
  emit({{"event", "ready"}});
  while (running) {
    std::vector<json> pending;
    { std::lock_guard<std::mutex> lock(queueMutex); pending.swap(commands); }
    for (const auto& command : pending) {
      const auto op = command.value("op", std::string());
      if (op == "connect") {
        const auto token = command.value("token", std::string());
        if (token.empty()) { emit({{"event", "error"}, {"message", "Missing OAuth access token"}}); continue; }
        client.UpdateToken(discordpp::AuthorizationTokenType::Bearer, token, [&client, &connected](discordpp::ClientResult result) {
          if (!result.Successful()) { emit({{"event", "auth_error"}, {"message", result.Error()}}); return; }
          client.Connect(); connected = true; emit({{"event", "authenticated"}});
        });
      } else if (op == "token") {
        client.UpdateToken(discordpp::AuthorizationTokenType::Bearer, command.value("token", std::string()), [](discordpp::ClientResult result) {
          emit({{"event", result.Successful() ? "token_updated" : "auth_error"}, {"message", result.Successful() ? "OAuth token refreshed" : result.Error()}});
        });
      } else if (op == "activity" && connected) setActivity(client, command.value("profile", json::object()));
      else if (op == "clear" && connected) { client.ClearRichPresence(); emit({{"event", "presence_cleared"}}); }
      else if (op == "stop") { client.ClearRichPresence(); running = false; }
      else if (op == "status" && connected) {
        const auto status = command.value("status", std::string("Online"));
        const auto mapped = status == "Idle" ? discordpp::StatusType::Idle : status == "Do not disturb" ? discordpp::StatusType::Dnd : status == "Invisible" ? discordpp::StatusType::Invisible : status == "Offline" ? discordpp::StatusType::Offline : discordpp::StatusType::Online;
        client.SetOnlineStatus(mapped, [](discordpp::ClientResult result) {
          emit({{"event", result.Successful() ? "status_updated" : "status_error"}, {"message", result.Successful() ? "Account status updated" : result.Error()}});
        });
      }
    }
    discordpp::RunCallbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  client.ClearRichPresence();
  if (input.joinable()) input.detach();
  return 0;
}

