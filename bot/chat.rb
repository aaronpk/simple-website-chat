Bundler.require
require 'yaml'
$config = YAML.load_file 'config.yml'

class API < Sinatra::Base
  configure do
    set :threaded, false
    set :bind, $config['api']['host']
    set :port, $config['api']['port']
  end

  def validate_token(input)
    begin
      token = JWT::decode input, $config['secret'], 'HS256'
      channel = token[0]['channel']
      nick = "[#{$config['nick_prefix']}]#{token[0]['nickname']}"
    rescue JWT::ExpiredSignature
      return "token expired"
    rescue => e
      return "invalid token"
    end

    return {
      token: token,
      channel: channel,
      nick: nick
    }
  end

  get '/' do
    "Connected to #{$config['irc']['server']} as #{$config['irc']['nick']}"
  end

  # The widget first pings this to see if it should be displayed
  get '/active' do
    active = false

    redis = Redis.new
    last = redis.get "#{$config['redis_prefix']}:last_admin_ping"

    if !last.nil? && Time.now.to_i - last.to_i < 120
      active = true
    end

    {
      active: active
    }.to_json
  end

  # Connection request sent from the JS chat widget. If it contains a cookie,
  # they might have already logged in and be associated with an active chat channel.
  get '/login' do

    channel = '#'+$config['channel_prefix']+"_"+SecureRandom.hex(4)

    token = JWT::encode({
      channel: channel,
      nickname: params[:nick],
      referer: request.referer
    }, $config['secret'], 'HS256')

    # Join the new channel
    $client.join(channel)

    # Send an invite to the admin. Admins should have "autojoin on invite" turned on in their client.
    $client.Channel(channel).invite $config['admin_nick']

    $client.Channel($config['admin_channel']).send "#{$config['admin_nick']}: New guest joined #{channel} #{request.referer ? 'From '+request.referer : ''} #{request.ip} (#{request.user_agent})"

    # Return the channel token to the client
    {
      token: token,
      channel: channel.gsub('#','')
    }.to_json
  end

  # Message sent from JS chat widget, send to the appropriate IRC channel.
  post '/send' do
    token = validate_token params[:token]

    if token.is_a? String
      return token
    end

    # Join the channel if somehow the bot was disconnected. 
    # (e.g. if the bot is restarted)
    if !$client.channels.include?(token[:channel])
      $client.join(token[:channel])
    end

    $client.Channel(token[:channel]).send "#{token[:nick]}: #{params[:text]}"

    {
      result: "sent"
    }.to_json
  end

  # Sent when the JS widget is closing
  post '/quit' do
    token = validate_token params[:token]

    if token.is_a? String
      return token
    end

    $client.Channel(token[:channel]).send "[Chat window closed]"

    {
      result: "sent"
    }.to_json
  end

  post '/resumed' do
    token = validate_token params[:token]

    if token.is_a? String
      return token
    end

    $client.Channel(token[:channel]).send "Session resumed from #{request.referer}"

    {
      result: "sent"
    }.to_json
  end

  # Pinged from the admin interface to indicate someone is available
  post '/online' do
    redis = Redis.new
    if params[:seconds].to_i < 120
      last = redis.setex "#{$config['redis_prefix']}:last_admin_ping", 120, Time.now.to_i
      {
        result: "online"
      }.to_json
    else
      redis.del "#{$config['redis_prefix']}:last_admin_ping"
      {
        result: "offline"
      }.to_json    
    end
  end

end

def handle_event(event, data, text=nil)
  puts "Received event from IRC: #{event} #{data} #{text}"
end

# Message is sent from IRC (either a bot or human agent) to a channel
# Route the message to the appropriate web subscription
def handle_message(is_bot, channel, user, text, modes=[])
  puts "Received message from IRC: #{channel} #{user} #{text}"

  HTTParty.post "#{$config['streaming_pub']}?id=#{channel.gsub('#','')}", {
    body: {
      text: text,
      nick: user.nick
    }.to_json,
    verify: false
  }
end



$client = Cinch::Bot.new do
  configure do |c|
    c.server = $config['irc']['host']
    c.port = $config['irc']['port']
    c.password = $config['irc']['password']
    if $config['irc']['ssl']
      c.ssl.use = true
    end
    c.nick = $config['irc']['nick']
    c.user = $config['irc']['username']
    c.channels = [$config['admin_channel']]
  end

  on :message do |data, nick|
    channel = data.channel ? data.channel.name : data.user.nick

    # IRC "/me" lines end up coming through as PRIVMSG "\u0001ACTION waves\u0001"
    if match = data.message.match(/\u0001ACTION (.+)\u0001/)
      text = "/me #{match[1]}"
    else
      text = data.message
    end

    modes = []
    modes << 'voice' if data.channel.voiced?(data.user)
    modes << 'op' if data.channel.opped?(data.user)

    is_bot = data.user.nick == $config['irc']['nick']
    handle_message is_bot, channel, data.user, text, modes
  end

  on :invite do |data, nick|
    $client.join(data.channel)
  end

  on :topic do |data|
    handle_event 'topic', data, data.message
  end

  on :part do |data|
    handle_event 'leave', data
  end

  on :join do |data|
    handle_event 'join', data
  end

end

Thread.new do
  $client.start
end

API.run!
