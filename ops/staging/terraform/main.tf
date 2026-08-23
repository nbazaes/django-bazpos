terraform {
  required_version = "1.15.9"
  required_providers {
    libvirt = {
      source  = "dmacvicar/libvirt"
      version = "~> 0.9.8"
    }
  }
}

provider "libvirt" {
  uri = "qemu:///system"
}

# 1. Imagen base oficial de Ubuntu descargada al pool
resource "libvirt_volume" "ubuntu_base" {
  name = "ubuntu-24.04-noble.qcow2"
  pool = "default"
  target = {
    format = { type = "qcow2" }
  }
  create = {
    content = {
      url = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
    }
  }
}

# 2. Disco Copy-on-Write de 25 GB derivado de la imagen base
resource "libvirt_volume" "staging_disk" {
  name     = "staging-disk.qcow2"
  pool     = "default"
  capacity = 26843545600 # 25 GB en bytes
  target = {
    format = { type = "qcow2" }
  }
  backing_store = {
    path   = libvirt_volume.ubuntu_base.path
    format = { type = "qcow2" }
  }
}

# 3. ISO de Cloud-Init (genera el archivo localmente)
resource "libvirt_cloudinit_disk" "commoninit" {
  name = "commoninit"
  user_data = templatefile("${path.module}/cloud_init.cfg", {
    ssh_key = file("~/.ssh/id_ed25519.pub")
  })
  meta_data = yamlencode({
    instance-id    = "bazpos-staging"
    local-hostname = "bazpos-staging"
  })
  network_config = yamlencode({
    version = 2
    ethernets = {
      eth0 = {
        match = { name = "en*" }
        dhcp4 = true
      }
    }
  })
}

# 3b. Subir el ISO de Cloud-Init al pool de libvirt
resource "libvirt_volume" "cloudinit_iso" {
  name = "commoninit.iso"
  pool = "default"
  create = {
    content = {
      url = libvirt_cloudinit_disk.commoninit.path
    }
  }
}

# 4. Máquina Virtual (1 vCPU, 1024 MB RAM)
resource "libvirt_domain" "bazpos_staging" {
  name        = "bazpos-staging-vm"
  type        = "kvm"
  memory      = 1024
  memory_unit = "MiB"
  vcpu        = 1

  cpu = {
    mode = "host-passthrough"
  }

  os = {
    type      = "hvm"
    type_arch = "x86_64"
  }

  devices = {
    disks = [
      {
        driver = {
          name = "qemu"
          type = "qcow2"
        }
        source = {
          volume = {
            pool   = "default"
            volume = libvirt_volume.staging_disk.name
          }
        }
        target = {
          dev = "vda"
          bus = "virtio"
        }
      },
      {
        device = "cdrom"
        source = {
          volume = {
            pool   = "default"
            volume = libvirt_volume.cloudinit_iso.name
          }
        }
        target = {
          dev = "sda"
          bus = "sata"
        }
      }
    ]

    consoles = [
      {
        type = "pty"
        target = {
          type = "serial"
          port = 0
        }
      }
    ]

    interfaces = [
      {
        type = "network"
        source = {
          network = {
            network = "default"
          }
        }
        model = {
          type = "virtio"
        }
      }
    ]
  }

  running   = true
  autostart = true
}
# 5. Data source para consultar la IP asignada por DHCP
data "libvirt_domain_interface_addresses" "bazpos_staging" {
  domain = libvirt_domain.bazpos_staging.name
  source = "lease"
}

output "staging_ip" {
  description = "Dirección IP de la VM de staging"
  value       = length(data.libvirt_domain_interface_addresses.bazpos_staging.interfaces) > 0 && length(data.libvirt_domain_interface_addresses.bazpos_staging.interfaces[0].addrs) > 0 ? data.libvirt_domain_interface_addresses.bazpos_staging.interfaces[0].addrs[0].addr : "No IP address found"
}
