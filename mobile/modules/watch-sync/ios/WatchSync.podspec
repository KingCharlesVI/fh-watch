Pod::Spec.new do |s|
  s.name           = 'WatchSync'
  s.version        = '0.1.0'
  s.summary        = 'Apple Watch sync for FH Match Centre'
  s.description    = 'Receives matches from the Apple Watch app over WatchConnectivity.'
  s.license        = 'UNLICENSED'
  s.author         = 'FH Match Centre'
  s.homepage       = 'https://fhmatchcentre.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
