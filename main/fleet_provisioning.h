#ifndef FLEET_PROVISIONING_H
#define FLEET_PROVISIONING_H

#include <stdbool.h>
#include "config_store.h"

bool fleet_provisioning_ensure_identity(const device_config_t *config);

#endif
