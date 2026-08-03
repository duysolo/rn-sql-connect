#import "RnSqlConnect.h"

#if __has_include(<rn_sql_connect/rn_sql_connect-Swift.h>)
#import <rn_sql_connect/rn_sql_connect-Swift.h>
#else
#import "rn_sql_connect-Swift.h"
#endif

@implementation RnSqlConnect {
  RnSqlConnectCore *_core;
}

RCT_EXPORT_MODULE()

- (instancetype)init
{
  if (self = [super init]) {
    _core = [RnSqlConnectCore new];
    __weak __typeof(self) weakSelf = self;
    // Subscription updates travel as a small map with a JSON string inside.
    // Data Connect encodes Int64, UUID, Date and Timestamp as strings, and a
    // bridge map round trip risks coercing those into doubles.
    _core.onEvent = ^(NSString *subId, NSString *payloadJson) {
      __typeof(self) strongSelf = weakSelf;
      if (strongSelf == nil) {
        return;
      }
      [strongSelf emitOnQueryEvent:@{@"subId" : subId, @"payloadJson" : payloadJson}];
    };
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)invalidate
{
  [_core invalidate];
  [super invalidate];
}

/// Wraps the React Native reject block so Swift can stay free of React types.
static void (^RNSCReject(RCTPromiseRejectBlock reject))(NSString *, NSString *, NSString *)
{
  return ^(NSString *code, NSString *message, NSString *details) {
    NSError *error = [NSError errorWithDomain:@"RnSqlConnect"
                                         code:0
                                     userInfo:@{@"details" : details ?: @""}];
    reject(code, message, error);
  };
}

- (void)configure:(NSString *)instanceKey
          appName:(NSString *)appName
        connector:(NSString *)connector
         location:(NSString *)location
        serviceId:(NSString *)serviceId
     settingsJson:(NSString *)settingsJson
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_core configureWithInstanceKey:instanceKey
                          appName:appName
                        connector:connector
                         location:location
                        serviceId:serviceId
                     settingsJson:settingsJson
                          resolve:resolve
                           reject:RNSCReject(reject)];
}

- (void)useEmulator:(NSString *)instanceKey
               host:(NSString *)host
               port:(double)port
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  [_core useEmulatorWithInstanceKey:instanceKey
                               host:host
                               port:(NSInteger)port
                            resolve:resolve
                             reject:RNSCReject(reject)];
}

- (void)executeQuery:(NSString *)instanceKey
       operationName:(NSString *)operationName
       variablesJson:(NSString *)variablesJson
         fetchPolicy:(NSString *)fetchPolicy
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [_core executeQueryWithInstanceKey:instanceKey
                       operationName:operationName
                       variablesJson:variablesJson
                         fetchPolicy:fetchPolicy
                             resolve:resolve
                              reject:RNSCReject(reject)];
}

- (void)executeMutation:(NSString *)instanceKey
          operationName:(NSString *)operationName
          variablesJson:(NSString *)variablesJson
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  [_core executeMutationWithInstanceKey:instanceKey
                          operationName:operationName
                          variablesJson:variablesJson
                                resolve:resolve
                                 reject:RNSCReject(reject)];
}

- (void)subscribe:(NSString *)instanceKey
            subId:(NSString *)subId
    operationName:(NSString *)operationName
    variablesJson:(NSString *)variablesJson
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_core subscribeWithInstanceKey:instanceKey
                            subId:subId
                    operationName:operationName
                    variablesJson:variablesJson
                          resolve:resolve
                           reject:RNSCReject(reject)];
}

- (void)unsubscribe:(NSString *)subId
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  [_core unsubscribeWithSubId:subId resolve:resolve reject:RNSCReject(reject)];
}

- (void)terminate:(NSString *)instanceKey
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_core terminateWithInstanceKey:instanceKey resolve:resolve reject:RNSCReject(reject)];
}

- (void)getDiagnostics:(NSString *)instanceKey
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  [_core getDiagnosticsWithInstanceKey:instanceKey resolve:resolve reject:RNSCReject(reject)];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeRnSqlConnectSpecJSI>(params);
}

@end
