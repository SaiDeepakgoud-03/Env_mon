#ifndef CERT_STORE_H
#define CERT_STORE_H

#include <stdbool.h>
#include <stddef.h>

#define CERT_STORE_CERT_MAX 4096
#define CERT_STORE_KEY_MAX  4096

bool cert_store_has_device_identity(void);
bool cert_store_load(char *certificate, size_t certificate_size, char *private_key, size_t private_key_size);
bool cert_store_save(const char *certificate, const char *private_key);
bool cert_store_erase(void);

#endif
